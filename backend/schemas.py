from typing import Literal

from pydantic import BaseModel, Field


class GenerateScriptRequest(BaseModel):
    prompt: str = Field(..., description="High-level description of the Roblox game or change")
    image_data: str | None = Field(
        default=None,
        description="Optional image as a data URL (e.g. data:image/png;base64,...) to guide generation",
    )
    image_data_list: list[str] | None = Field(
        default=None,
        description="Optional list of up to 2 images as data URLs (data:image/...;base64,...) to guide generation",
    )
    style: str | None = Field(
        default=None,
        description="Optional style or genre, e.g. 'obby', 'simulator', 'tycoon'",
    )
    max_tokens: int | None = Field(
        default=800,
        description="Upper bound on generated Lua tokens (model-dependent)",
        ge=100,
        le=4000,
    )


class GeneratedScript(BaseModel):
    lua_code: str = Field(..., description="Roblox Lua script ready to paste into Studio")
    description: str = Field(..., description="Plain-language summary of what the code does")
    setup_steps: list[str] | None = Field(
        default=None,
        description="Optional short steps for setting up this script in Roblox Studio",
    )


class GenerateScriptResponse(BaseModel):
    script: GeneratedScript


class RefineScriptRequest(BaseModel):
    current_lua_code: str = Field(..., description="Existing Roblox Lua code to refine")
    refinement_request: str = Field(..., description="Requested improvement/change")
    max_tokens: int | None = Field(
        default=1200,
        description="Upper bound on generated Lua tokens (model-dependent)",
        ge=100,
        le=4000,
    )


class RefineScriptResponse(BaseModel):
    script: GeneratedScript
    change_summary: list[str] | None = Field(
        default=None,
        description="Short bullets describing what changed",
    )


class BuildGameRequest(BaseModel):
    prompt: str = Field(..., description="High-level game request or follow-up change")
    studio_snapshot: str | None = Field(
        default=None,
        description="Optional text snapshot of the current Roblox Studio place",
    )
    max_tokens: int | None = Field(
        default=2200,
        description="Upper bound on generated output tokens",
        ge=200,
        le=5000,
    )


class BuildProperty(BaseModel):
    name: str = Field(..., description="Roblox property name")
    value_json: str = Field(
        ...,
        description="JSON-encoded property value so the plugin can decode it safely",
    )


class BuildOperation(BaseModel):
    type: Literal["upsert_script", "ensure_instance", "set_properties", "delete_instance"]
    path: str = Field(..., description="Absolute Roblox path like ServerScriptService/GameManager")
    class_name: str | None = Field(
        default=None,
        description="Roblox class to create when needed, e.g. Script, Folder, Part",
    )
    source: str | None = Field(
        default=None,
        description="Lua source used by script operations",
    )
    properties: list[BuildProperty] | None = Field(
        default=None,
        description="Optional properties to set on the target instance",
    )
    reason: str | None = Field(
        default=None,
        description="Short explanation for why this operation exists",
    )


class SyncPushRequest(BaseModel):
    """
    Push the latest generated Roblox code from your platform into memory.

    The Roblox Studio plugin can then poll `/sync/latest` and apply updates automatically.
    """

    sync_key: str = Field(..., description="Key shared between your platform and the Studio plugin")
    version: str | None = Field(
        default=None,
        description="Optional version string (e.g. generation id). If omitted, backend generates one.",
    )
    combined_lua: str | None = Field(
        default=None,
        description=(
            "Optional combined Lua text. If provided, the plugin can install it using "
            "the `-- Script: <Service>/<Path>` headers."
        ),
    )
    operations: list[BuildOperation] | None = Field(
        default=None,
        description="Optional structured build operations to apply inside Studio",
    )


class SyncPushResponse(BaseModel):
    sync_key: str
    version: str
    updated_at: str
    mode: str = Field(description="Which payload fields were stored: combined_lua / operations / both")


class SyncLatestResponse(BaseModel):
    sync_key: str
    version: str
    updated_at: str
    combined_lua: str | None = None
    operations: list[BuildOperation] | None = None


class BuildGameResult(BaseModel):
    summary: str = Field(..., description="Short user-facing summary of the planned build")
    systems: list[str] = Field(default_factory=list, description="Gameplay systems being created")
    setup_steps: list[str] = Field(
        default_factory=list,
        description="Studio setup steps or assumptions",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Warnings or assumptions the user should know about",
    )
    operations: list[BuildOperation] = Field(
        default_factory=list,
        description="Structured build operations to apply inside Studio",
    )
    combined_lua: str = Field(
        default="",
        description="Combined script preview assembled from script operations",
    )


class BuildGameResponse(BaseModel):
    build: BuildGameResult


class AuthSignupRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="User password (min 6 chars)")


class AuthLoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class AuthTokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer")


class MeResponse(BaseModel):
    email: str


class ProfileResponse(BaseModel):
    email: str
    name: str | None = None
    handle: str | None = None
    bio: str | None = None


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    handle: str | None = None
    bio: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="Account email address")


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    message: str = Field(
        default=(
            "Request received. If this email is already registered, a reset link was sent. "
            "Otherwise use Sign up first."
        )
    )


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8, description="Token from the reset email link")
    new_password: str = Field(..., min_length=6, description="New password (min 6 chars)")


class GenerationCreateRequest(BaseModel):
    project_id: str = Field(..., description="Project id (stringified ObjectId)")
    prompt: str = Field(..., description="User prompt used for generation")
    style: str | None = Field(default=None, description="Optional style/genre")
    image_count: int = Field(default=0, ge=0, le=2, description="Number of images used (0-2)")
    model: str | None = Field(default=None, description="Model identifier used (optional)")
    lua_code: str = Field(..., description="Generated Lua code")
    description: str = Field(default="", description="Generated description text")
    setup_steps: list[str] | None = Field(default=None, description="Optional setup steps")


class GenerationResponse(BaseModel):
    id: str
    project_id: str
    created_at: str
    prompt: str
    style: str | None = None
    image_count: int = 0
    model: str | None = None
    lua_code: str
    description: str = ""
    setup_steps: list[str] | None = None
