import json
import os
import re
from pathlib import Path
from textwrap import dedent
from typing import Iterator

from dotenv import load_dotenv
from openai import OpenAI

from .schemas import (
    BuildGameRequest,
    BuildGameResult,
    BuildOperation,
    BuildProperty,
    GenerateScriptRequest,
    GeneratedScript,
    RefineScriptRequest,
)


BASE_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = BASE_DIR / "config"
ENV_PATH = CONFIG_DIR / ".env"
BACKEND_ENV_PATH = BASE_DIR / "backend" / ".env"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH)
if BACKEND_ENV_PATH.exists():
    load_dotenv(BACKEND_ENV_PATH)


_SYSTEM_PROMPT = dedent(
    """
    You are an expert Roblox game developer and Lua programmer.
    The user will describe exactly what they want. You must respond with valid JSON only.

    CRITICAL — MINIMAL CODE ONLY:
    - Implement ONLY the exact behavior the user asked for. Nothing else.
    - Do NOT add boilerplate, "getting" services, or helper functions the user did not ask for.
    - Example: If the user says "when touches apple his health increases", write ONLY:
      (1) the code that runs when the apple is touched (Touched event),
      (2) get the player who touched it and increase that player's health.
      Do NOT write a long "increaseHealth(player)" helper, GetService('Players') setup, or comments like "Get the apple" unless they are necessary for the few lines that do the job.
    - Prefer a short script: assume the script lives inside the Part (e.g. "Apple"). Use `script.Parent` for the part. Connect to Touched, get the player from the touching part, then change Humanoid.Health. No extra functions or services unless needed for that single behavior.
    - Another example: "coin that gives 10 points" → only the code that detects touch and adds 10 to Points. No respawn, no extra coins, no GUI unless asked.
    - Match the scope of the request exactly: minimal, focused code.

    LEADERSTAT NAMING (when points/score are involved):
    - Use the leaderstat name "Points" (capital P) when the user mentions points or score. Do NOT use CoinsCollected, Coins, or Score unless they ask for that exact name.

    Output a single JSON object with exactly these keys:
    - "description": A detailed, ChatGPT-style, user-facing explanation that covers THREE things:
        (A) the gameplay / feature being built (what happens in-game),
        (B) how the Lua code works (key steps, events, and objects used), and
        (C) exactly WHERE and HOW to place each script and any required instances in Roblox Studio (for example: 'Put this Script in ServerScriptService as GameManager', 'Create a Folder named Zombies in Workspace and place 5 NPC models inside it').
      IMPORTANT: "description" must be a SINGLE STRING (not an array). Format it as 8–16 short bullet lines separated by newline characters (\\n), e.g.:
        "- ...\\n- ...\\n- ..."\n
      Include at least 2–4 bullets specifically about placement/setup in Studio so a beginner knows exactly where each script and object goes.
      Keep it strictly scoped to what the user asked—do NOT invent extra mechanics.
      If you must assume something (e.g., where the Script is placed), state the assumption explicitly in one line and implement accordingly.
      If the user gave an image, mention what you used from the image in 1 line (only if relevant).
    - "lua_code": A minimal, ready-to-paste Roblox Lua script that implements ONLY the described behavior. Short and focused.
    - "setup_steps": An array of 3 to 5 short strings: specific steps for setting up this script in Roblox Studio (e.g. "Create a Part named Apple in Workspace", "Put this Script inside the Apple", "Press Play and touch the apple to test"). Steps must match what the script actually does.

    Requirements for lua_code:
    - Minimal: only the logic for the requested behavior. No long intros or unnecessary helpers.
    - At the very top of lua_code, ALWAYS include one or more comment headers of the form:
        -- Script: <Service>/<OptionalFolder>/<ScriptName>
      Example for a single script: -- Script: ServerScriptService/ZombieGame
      Example for multiple scripts in one lua_code: use multiple headers to start each section, e.g.
        -- Script: ServerScriptService/ZombieAI
        ...code...
        -- Script: ServerScriptService/SurvivalTimer
        ...code...
        -- Script: StarterGui/EndScreenGui
        ...code...
      These headers tell the user exactly where to place each Script in Roblox Studio.
    - FORMAT: Use normal line breaks and indentation. One statement per line. Do NOT output one long line.
    - Correct Lua scope. Modern Roblox Lua only (GetService, Touched, Humanoid, etc.) when needed.
    - If the script is meant to go inside a Part (e.g. apple), use script.Parent as the part and keep the script short.
    - No placeholder comments like "add your logic here"; implement the behavior fully in few lines.

    Reply with only the JSON object, no markdown, no code fences, no extra text.
    """
).strip()

_STREAMING_SYSTEM_PROMPT = dedent(
    """
    You are an expert Roblox Lua game developer for Roblox Studio.

    CRITICAL:
    - Output VALID LUA CODE ONLY. Do NOT include markdown, headings, numbered steps, or backticks.
    - You MUST support installing multiple scripts. Output one or more sections using headers exactly like:
        -- Script: ServerScriptService/GameManager
        <lua code for that script>
    - You MUST include at least one header. Use these paths exactly as needed for placement.
    - At the very end, add a line containing only:
        -- END
    """
).strip()

_REFINE_SYSTEM_PROMPT = dedent(
    """
    You are refining an existing Roblox Lua game.
    Preserve existing behavior unless explicitly changed by the user.
    Make minimal, surgical edits and keep the game playable.

    Output a single JSON object with exactly these keys:
    - "description": short explanation of the refined result.
    - "lua_code": the full updated Lua code, ready to paste.
    - "setup_steps": optional array of setup steps (only if setup changed).
    - "change_summary": array of 3-8 short bullets describing key edits.

    Keep leaderstat name "Points" when points/score are involved unless user asks otherwise.
    Reply with JSON only, no markdown, no code fences.
    """
).strip()

_REFINE_STREAM_SYSTEM_PROMPT = dedent(
    """
    You are refining an existing Roblox Lua game.
    Preserve all current mechanics unless user explicitly asks to change them.
    Return only the full updated Lua code.
    Include script headers like: -- Script: ServerScriptService/ScriptName.
    Do not return JSON, markdown, or explanations.
    """
).strip()

_BUILD_SYSTEM_PROMPT = dedent(
    """
    You are an expert Roblox Studio game-building assistant.

    Your job is to transform a natural-language game request into a structured build plan
    that a Roblox Studio plugin can apply automatically.

    Return JSON only with these top-level keys:
    - summary: short paragraph describing the playable result.
    - systems: array of 3-8 short gameplay or technical systems.
    - setup_steps: array of short Studio setup notes/assumptions.
    - warnings: array of short warnings or assumptions.
    - operations: array of build operations.

    IMPORTANT:
    - Prefer multiple small operations instead of one giant script.
    - Build a playable prototype, but stay close to the user's request.
    - If the user provided an existing Studio snapshot, preserve and extend it instead of replacing everything.
    - When code is needed, emit `upsert_script` operations with full Lua source.
    - Every script source MUST start with `-- Script: <Path>`.
    - Paths must be absolute Roblox paths like `ServerScriptService/GameManager` or `Workspace/Map/SpawnPad`.
    - Use `ensure_instance` for non-script objects such as Folder, Part, RemoteEvent, ScreenGui, TextButton, SpawnLocation.
    - Use `set_properties` only when the target already exists or after an ensure for the same path.
    - Use `delete_instance` only when clearly necessary to remove a broken/replaced object.
    - Keep scripts cohesive and production-minded: server logic in ServerScriptService, shared code in ReplicatedStorage/ModuleScript, client UI in StarterGui or StarterPlayerScripts.

    Supported operation shapes:
    1. upsert_script
       - path
       - class_name: Script | LocalScript | ModuleScript
       - source
       - optional reason
    2. ensure_instance
       - path
       - class_name
       - optional properties: [{name, value_json}]
       - optional reason
    3. set_properties
       - path
       - properties: [{name, value_json}]
       - optional reason
    4. delete_instance
       - path
       - optional reason

    For `value_json`, provide valid JSON-encoded primitive/object values like:
    - `"Play"` for a string
    - `true` for a boolean
    - `12` for a number
    - `{"rbx_type":"Vector3","x":0,"y":8,"z":0}` for a Vector3
    - `{"rbx_type":"Color3","r":255,"g":255,"b":255}` for a Color3
    - `{"rbx_type":"UDim2","xScale":0.5,"xOffset":0,"yScale":0,"yOffset":40}` for a UDim2

    Keep the operation list practical for an MVP and avoid unsupported Roblox APIs.
    Reply with valid JSON only.
    """
).strip()


def _get_groq_api_key() -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError(
            "Missing Groq key. Set GROQ_API_KEY in config/.env or backend/.env (get it from console.groq.com/keys), then restart."
        )
    return api_key.strip()


def _get_ai_client_and_models() -> tuple[OpenAI, str, str, str]:
    """Build an OpenAI-compatible client and choose provider/models from env."""
    openai_api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if openai_api_key:
        base_url = os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
        text_model = os.getenv("OPENAI_MODEL") or "gpt-4.1-mini"
        vision_model = os.getenv("OPENAI_VISION_MODEL") or text_model
        return OpenAI(api_key=openai_api_key, base_url=base_url), "openai", text_model, vision_model

    groq_api_key = _get_groq_api_key()
    base_url = os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"
    text_model = os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
    vision_model = os.getenv("GROQ_VISION_MODEL") or "meta-llama/llama-4-scout-17b-16e-instruct"
    return OpenAI(api_key=groq_api_key, base_url=base_url), "groq", text_model, vision_model


def _provider_display_name(provider: str) -> str:
    # User-friendly branding in errors.
    if provider == "openai":
        return "OpenAI"
    if provider == "groq":
        return "Groq"
    return provider.capitalize()


def _sse_data(value: str) -> str:
    """Format one Server-Sent Event data frame."""
    return f"data: {value}\n\n"


def stream_roblox_lua_generation(prompt: str) -> Iterator[str]:
    """
    Stream Roblox Lua generation as SSE chunks.

    Yields already-formatted SSE frames: `data: <chunk>\\n\\n`.
    """
    cleaned_prompt = (prompt or "").strip()
    if not cleaned_prompt:
        yield _sse_data("[ERROR] Missing 'prompt' query parameter.")
        return

    try:
        client, provider, text_model, _ = _get_ai_client_and_models()
        stream = client.chat.completions.create(
            model=text_model,
            messages=[
                {"role": "system", "content": _STREAMING_SYSTEM_PROMPT},
                {"role": "user", "content": cleaned_prompt},
            ],
            temperature=0.2,
            stream=True,
        )

        sent_any = False
        for chunk in stream:
            try:
                delta = chunk.choices[0].delta.content
            except Exception:
                delta = None
            if not delta:
                continue
            sent_any = True
            # Keep SSE payload single-line to avoid malformed events.
            safe_delta = delta.replace("\r", "\\r").replace("\n", "\\n")
            yield _sse_data(safe_delta)

        if not sent_any:
            yield _sse_data(f"[ERROR] {_provider_display_name(provider)} returned no streamed content.")
            return
        yield _sse_data("[DONE]")
    except Exception as exc:
        yield _sse_data(f"[ERROR] {exc}")


def stream_refined_roblox_lua(payload: RefineScriptRequest) -> Iterator[str]:
    """Stream refined full Lua code as SSE chunks."""
    current_lua = (payload.current_lua_code or "").strip()
    refine_request = (payload.refinement_request or "").strip()
    if not current_lua:
        yield _sse_data("[ERROR] current_lua_code is required for refinement.")
        return
    if not refine_request:
        yield _sse_data("[ERROR] refinement_request is required.")
        return

    try:
        client, provider, text_model, _ = _get_ai_client_and_models()
        user_content = _build_refine_prompt(payload)
        stream = client.chat.completions.create(
            model=text_model,
            messages=[
                {"role": "system", "content": _REFINE_STREAM_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            stream=True,
        )

        sent_any = False
        for chunk in stream:
            try:
                delta = chunk.choices[0].delta.content
            except Exception:
                delta = None
            if not delta:
                continue
            sent_any = True
            safe_delta = delta.replace("\r", "\\r").replace("\n", "\\n")
            yield _sse_data(safe_delta)

        if not sent_any:
            yield _sse_data(f"[ERROR] {_provider_display_name(provider)} returned no streamed content.")
            return
        yield _sse_data("[DONE]")
    except Exception as exc:
        yield _sse_data(f"[ERROR] {exc}")


def _parse_json_from_response(text: str, required_fields: tuple[str, ...] = ("lua_code",)) -> dict:
    """Strict JSON parse with configurable required fields."""
    raw = (text or "").strip()
    if not raw:
        raise RuntimeError("Model returned empty response.")
    try:
        out = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Model did not return valid JSON. Preview: {raw[:300]}...") from exc
    if not isinstance(out, dict):
        raise RuntimeError(f"Model returned JSON object in unexpected shape. Preview: {raw[:300]}...")
    missing = [field for field in required_fields if field not in out]
    if missing:
        raise RuntimeError(
            f"Model returned JSON missing required fields {missing}. Preview: {raw[:300]}..."
        )
    return out


def _generate_schema_response_format() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "roblox_generate_response",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "description": {"type": "string"},
                    "lua_code": {"type": "string"},
                    "setup_steps": {
                        "type": ["array", "null"],
                        "items": {"type": "string"},
                    },
                },
                "required": ["description", "lua_code", "setup_steps"],
            },
        },
    }


def _refine_schema_response_format() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "roblox_refine_response",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "description": {"type": "string"},
                    "lua_code": {"type": "string"},
                    "setup_steps": {
                        "type": ["array", "null"],
                        "items": {"type": "string"},
                    },
                    "change_summary": {
                        "type": ["array", "null"],
                        "items": {"type": "string"},
                    },
                },
                "required": ["description", "lua_code", "setup_steps", "change_summary"],
            },
        },
    }


def _build_schema_response_format() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "roblox_build_response",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "summary": {"type": "string"},
                    "systems": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "setup_steps": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "warnings": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "operations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "upsert_script",
                                        "ensure_instance",
                                        "set_properties",
                                        "delete_instance",
                                    ],
                                },
                                "path": {"type": "string"},
                                "class_name": {"type": ["string", "null"]},
                                "source": {"type": ["string", "null"]},
                                "reason": {"type": ["string", "null"]},
                                "properties": {
                                    "type": ["array", "null"],
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "name": {"type": "string"},
                                            "value_json": {"type": "string"},
                                        },
                                        "required": ["name", "value_json"],
                                    },
                                },
                            },
                            "required": ["type", "path", "class_name", "source", "reason", "properties"],
                        },
                    },
                },
                "required": ["summary", "systems", "setup_steps", "warnings", "operations"],
            },
        },
    }


def _default_script_class(path: str) -> str:
    root = (path.split("/", 1)[0] if path else "").strip()
    if root in {"StarterGui", "StarterPlayerScripts", "StarterCharacterScripts"}:
        return "LocalScript"
    if root in {"ReplicatedStorage", "ReplicatedFirst"}:
        return "ModuleScript"
    return "Script"


def _normalize_build_operations(raw_operations: list[dict] | None) -> list[BuildOperation]:
    normalized: list[BuildOperation] = []
    for item in raw_operations or []:
        if not isinstance(item, dict):
            continue
        op_type = str(item.get("type") or "").strip()
        path = str(item.get("path") or "").strip()
        if not op_type or not path:
            continue

        raw_props = item.get("properties")
        props: list[BuildProperty] | None = None
        if isinstance(raw_props, list):
            props = []
            for prop in raw_props:
                if not isinstance(prop, dict):
                    continue
                name = str(prop.get("name") or "").strip()
                value_json = prop.get("value_json")
                if not name:
                    continue
                if isinstance(value_json, str):
                    encoded = value_json
                else:
                    encoded = json.dumps(value_json)
                props.append(BuildProperty(name=name, value_json=encoded))
            if not props:
                props = None

        class_name = item.get("class_name")
        if class_name is not None:
            class_name = str(class_name).strip() or None
        source = item.get("source")
        if source is not None:
            source = str(source).strip()
        reason = item.get("reason")
        if reason is not None:
            reason = str(reason).strip() or None

        if op_type == "upsert_script":
            class_name = class_name or _default_script_class(path)
            source = source or ""
            if source and not source.lstrip().startswith("-- Script:"):
                source = f"-- Script: {path}\n{source}"
        elif op_type == "ensure_instance" and not class_name:
            class_name = "Folder"

        try:
            normalized.append(
                BuildOperation(
                    type=op_type,
                    path=path,
                    class_name=class_name,
                    source=source,
                    properties=props,
                    reason=reason,
                )
            )
        except Exception:
            continue
    return normalized


def _compose_build_lua_preview(operations: list[BuildOperation]) -> str:
    chunks: list[str] = []
    for op in operations:
        if op.type != "upsert_script" or not op.source:
            continue
        chunks.append(op.source.strip())
    if not chunks:
        return ""
    return "\n\n".join(chunk for chunk in chunks if chunk).strip()


def _build_game_prompt(payload: BuildGameRequest) -> str:
    base = [
        "Build or update a Roblox game based on the request below.",
        "Return a playable MVP with clean separation between server, client, and shared systems.",
        "",
        "User request:",
        payload.prompt.strip(),
    ]
    snapshot = (payload.studio_snapshot or "").strip()
    if snapshot:
        base.extend(
            [
                "",
                "Existing Studio snapshot:",
                snapshot,
                "",
                "Preserve useful existing work and extend it with minimal destructive changes.",
            ]
        )
    return "\n".join(base).strip()


async def generate_roblox_build(payload: BuildGameRequest) -> BuildGameResult:
    client, provider, text_model, _ = _get_ai_client_and_models()
    max_tokens = payload.max_tokens or 2200
    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": _BUILD_SYSTEM_PROMPT},
            {"role": "user", "content": _build_game_prompt(payload)},
        ],
        max_tokens=max_tokens,
        temperature=0.2,
        response_format=(
            _build_schema_response_format() if provider == "openai" else {"type": "json_object"}
        ),
    )

    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError(f"{_provider_display_name(provider)} returned an empty response.")

    parsed = _parse_json_from_response(
        content,
        required_fields=("summary", "systems", "setup_steps", "warnings", "operations"),
    )
    operations = _normalize_build_operations(parsed.get("operations"))
    return BuildGameResult(
        summary=str(parsed.get("summary") or "Generated a Roblox build plan.").strip(),
        systems=[str(x).strip() for x in parsed.get("systems") or [] if str(x).strip()],
        setup_steps=[str(x).strip() for x in parsed.get("setup_steps") or [] if str(x).strip()],
        warnings=[str(x).strip() for x in parsed.get("warnings") or [] if str(x).strip()],
        operations=operations,
        combined_lua=_compose_build_lua_preview(operations),
    )


async def generate_roblox_script(payload: GenerateScriptRequest) -> GeneratedScript:
    """Call the configured AI provider (OpenAI first, then Groq fallback)."""
    client, provider, text_model, vision_model = _get_ai_client_and_models()

    user_content = _build_user_prompt(payload)
    max_tokens = payload.max_tokens or 2000

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    images: list[str] = []
    if payload.image_data_list:
        images = [str(x).strip() for x in payload.image_data_list if str(x).strip()]
        images = images[:2]
    elif payload.image_data and payload.image_data.strip():
        images = [payload.image_data.strip()]

    response_format = (
        _generate_schema_response_format() if provider == "openai" else {"type": "json_object"}
    )

    if images:
        # Vision-capable request: pass images as image_url data URIs
        content_parts = [{"type": "text", "text": user_content}]
        for img in images:
            content_parts.append({"type": "image_url", "image_url": {"url": img}})

        messages.append(
            {
                "role": "user",
                "content": content_parts,
            }
        )
        model = vision_model
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.1,
            response_format=response_format,
        )
    else:
        messages.append({"role": "user", "content": user_content})
        model = text_model
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.1,
            response_format=response_format,
        )

    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError(f"{_provider_display_name(provider)} returned an empty response.")

    parsed = _parse_json_from_response(content)
    description = parsed.get("description") or "Generated Roblox script."
    lua_code = parsed.get("lua_code") or "-- No code generated."
    lua_code = _ensure_lua_line_breaks(lua_code)
    raw_steps = parsed.get("setup_steps")
    setup_steps = None
    if isinstance(raw_steps, list) and len(raw_steps) > 0:
        setup_steps = [str(s).strip() for s in raw_steps if s]

    return GeneratedScript(description=description, lua_code=lua_code, setup_steps=setup_steps)


def _ensure_lua_line_breaks(lua_code: str) -> str:
    """If the model returned one long line, split on semicolons so the code is readable."""
    if not lua_code or not lua_code.strip():
        return lua_code
    lines = lua_code.split("\n")
    if len(lines) >= 3:
        return "\n".join(l.strip() for l in lines).strip()
    one_line = " ".join(l.strip() for l in lines).strip()
    if ";" not in one_line:
        return lua_code
    parts = one_line.split(";")
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        out.append(p + ";" if not p.endswith(";") else p)
    return "\n".join(out).rstrip(";").strip()


def _build_user_prompt(payload: GenerateScriptRequest) -> str:
    base = (
        "Implement only what is described below. Do not add features or mechanics that are not asked for.\n\n"
        "Use consistent leaderstat names in every script: if the game involves points or score, use the leaderstat name 'Points'. "
        "Do not use different names (e.g. CoinsCollected, Coins, Score) unless the user explicitly asks for that exact name. "
        "This way all scripts (coins, leaderboard, UI, etc.) work together.\n\n"
        f"Game idea or change:\n{payload.prompt.strip()}"
    )
    if payload.style and payload.style.strip():
        base += f"\n\nStyle/genre (optional): {payload.style.strip()}"
    return base


def _build_refine_prompt(payload: RefineScriptRequest) -> str:
    return (
        "Refine the existing game code below based on the requested improvement.\n\n"
        "Requested improvement:\n"
        f"{payload.refinement_request.strip()}\n\n"
        "IMPORTANT:\n"
        "- Return the FULL updated game code, not only changed snippets.\n"
        "- Keep all unrelated scripts and mechanics intact.\n"
        "- Apply improvements only where requested.\n\n"
        "Existing Lua code to modify:\n"
        f"{payload.current_lua_code.strip()}"
    )


def _split_lua_sections(lua_text: str) -> list[tuple[str, str]]:
    """
    Split Lua into sections keyed by `-- Script: <path>`.
    Returns list of (path, code) preserving order.
    """
    text = (lua_text or "").replace("\r\n", "\n")
    lines = text.split("\n")
    header_re = re.compile(r"^\s*--\s*Script:\s*(.+?)\s*$", re.IGNORECASE)
    sections: list[tuple[str, str]] = []
    current_path: str | None = None
    current_lines: list[str] = []

    def push_current() -> None:
        nonlocal current_path, current_lines
        if current_path is None and not "".join(current_lines).strip():
            return
        path = current_path or "ServerScriptService/VibeCoderScript"
        code = "\n".join(current_lines).strip()
        if code:
            sections.append((path, code))

    for line in lines:
        m = header_re.match(line)
        if m:
            push_current()
            current_path = m.group(1).strip()
            current_lines = []
            continue
        if current_path is None and not sections and not current_lines:
            current_path = "ServerScriptService/VibeCoderScript"
        current_lines.append(line)
    push_current()
    return sections


def _compose_lua_sections(sections: list[tuple[str, str]]) -> str:
    out: list[str] = []
    for path, code in sections:
        out.append(f"-- Script: {path}")
        out.append(code.strip())
    return "\n\n".join(x for x in out if x.strip()).strip()


def _merge_refined_with_original(original_lua: str, refined_lua: str) -> str:
    """
    Ensure refine response returns full game:
    - If refined output contains all/most sections, use it as-is.
    - If it contains only a subset, replace those sections in original and keep others intact.
    """
    original_sections = _split_lua_sections(original_lua)
    refined_sections = _split_lua_sections(refined_lua)
    if not original_sections:
        return refined_lua.strip() or original_lua
    if not refined_sections:
        return original_lua

    # If refined seems complete enough, trust it.
    if len(refined_sections) >= len(original_sections):
        return refined_lua.strip()

    orig_by_path: dict[str, str] = {p: c for p, c in original_sections}
    refined_by_path: dict[str, str] = {p: c for p, c in refined_sections}
    merged: list[tuple[str, str]] = []
    for path, code in original_sections:
        merged.append((path, refined_by_path.get(path, code)))

    # Append truly new sections introduced by refinement.
    existing_paths = {p for p, _ in original_sections}
    for path, code in refined_sections:
        if path not in existing_paths:
            merged.append((path, code))

    return _compose_lua_sections(merged)


async def refine_roblox_script(payload: RefineScriptRequest) -> tuple[GeneratedScript, list[str] | None]:
    """Refine existing Lua code with minimal, surgical changes."""
    current_lua = (payload.current_lua_code or "").strip()
    refine_request = (payload.refinement_request or "").strip()
    if not current_lua:
        raise RuntimeError("current_lua_code is required for refinement.")
    if not refine_request:
        raise RuntimeError("refinement_request is required.")

    client, provider, text_model, _ = _get_ai_client_and_models()
    max_tokens = payload.max_tokens or 1200
    user_content = _build_refine_prompt(payload)

    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": _REFINE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        max_tokens=max_tokens,
        temperature=0.1,
        response_format=(
            _refine_schema_response_format() if provider == "openai" else {"type": "json_object"}
        ),
    )

    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError(f"{_provider_display_name(provider)} returned an empty response.")

    parsed = _parse_json_from_response(content)
    description = parsed.get("description") or "Refined Roblox script."
    lua_code = parsed.get("lua_code") or current_lua
    lua_code = _ensure_lua_line_breaks(lua_code)
    lua_code = _merge_refined_with_original(current_lua, lua_code)
    raw_steps = parsed.get("setup_steps")
    setup_steps = None
    if isinstance(raw_steps, list) and len(raw_steps) > 0:
        setup_steps = [str(s).strip() for s in raw_steps if s]

    raw_changes = parsed.get("change_summary")
    change_summary = None
    if isinstance(raw_changes, list) and len(raw_changes) > 0:
        change_summary = [str(s).strip() for s in raw_changes if str(s).strip()]

    return GeneratedScript(description=description, lua_code=lua_code, setup_steps=setup_steps), change_summary
