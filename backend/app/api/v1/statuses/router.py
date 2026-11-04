"""Status (stories) endpoints."""
from fastapi import APIRouter, Depends, status
from app.api.deps import get_current_user
from app.schemas.statuses import CreateStatusRequest
from app.services.status_service import StatusService
from app.core.exceptions import success_response

router = APIRouter(prefix="/statuses", tags=["Statuses"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_status(
    body: CreateStatusRequest,
    user: dict = Depends(get_current_user),
):
    status_obj = await StatusService.create_status(
        owner_id=user["id"],
        content=body.content,
        status_type=body.status_type,
        media_attachments=body.media_attachments,
        visibility=body.visibility,
        selected_viewer_ids=body.selected_viewer_ids,
        expires_in_hours=body.expires_in_hours,
        background=getattr(body, "background", None) or "solid_1",
    )
    return success_response("Status created", status_obj)


@router.get("/feed")
async def get_feed(user: dict = Depends(get_current_user)):
    feed = await StatusService.get_feed(user["id"])
    return success_response("Status feed", feed)


@router.get("/user/{user_id}")
async def get_user_statuses(user_id: str, user: dict = Depends(get_current_user)):
    items = await StatusService.get_user_statuses(user_id, user["id"])
    return success_response("User statuses", items)


@router.get("/{status_id}")
async def view_status(status_id: str, user: dict = Depends(get_current_user)):
    s = await StatusService.view_status(status_id, user["id"])
    return success_response("Status", s)


@router.delete("/{status_id}")
async def delete_status(status_id: str, user: dict = Depends(get_current_user)):
    await StatusService.delete_status(status_id, user["id"])
    return success_response("Status deleted")


@router.get("/{status_id}/viewers")
async def list_viewers(status_id: str, user: dict = Depends(get_current_user)):
    viewers = await StatusService.list_viewers(status_id, user["id"])
    return success_response("Viewers", viewers)


@router.post("/{status_id}/like")
async def toggle_like(status_id: str, user: dict = Depends(get_current_user)):
    result = await StatusService.toggle_like(status_id, user["id"])
    return success_response("Like updated", result)
