"""Group management endpoints."""
from fastapi import APIRouter, Depends, status
from app.api.deps import get_current_user
from app.schemas.groups import (
    CreateGroupRequest,
    UpdateGroupRequest,
    AddMembersRequest,
    GroupPermissionsUpdate,
)
from app.services.group_service import GroupService
from app.core.exceptions import success_response

router = APIRouter(prefix="/groups", tags=["Groups"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_group(
    body: CreateGroupRequest,
    user: dict = Depends(get_current_user),
):
    group = await GroupService.create_group(
        user["id"],
        body.group_name,
        body.group_description,
        body.member_usernames,
    )
    return success_response("Group created", group)


@router.get("")
async def list_my_groups(user: dict = Depends(get_current_user)):
    groups = await GroupService.list_my_groups(user["id"])
    return success_response("Groups", groups)


@router.get("/{group_id}")
async def get_group(group_id: str, user: dict = Depends(get_current_user)):
    group = await GroupService.get_group(group_id, user["id"])
    return success_response("Group", group)


@router.patch("/{group_id}")
async def update_group(
    group_id: str,
    body: UpdateGroupRequest,
    user: dict = Depends(get_current_user),
):
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }
    group = await GroupService.update_group(group_id, user["id"], updates)
    return success_response("Group updated", group)


@router.post("/{group_id}/members")
async def add_members(
    group_id: str,
    body: AddMembersRequest,
    user: dict = Depends(get_current_user),
):
    result = await GroupService.add_members(group_id, user["id"], body.usernames)
    return success_response("Members added", result)


@router.delete("/{group_id}/members/{target_user_id}")
async def remove_member(
    group_id: str,
    target_user_id: str,
    user: dict = Depends(get_current_user),
):
    await GroupService.remove_member(group_id, user["id"], target_user_id)
    return success_response("Member removed")


@router.post("/{group_id}/leave")
async def leave_group(group_id: str, user: dict = Depends(get_current_user)):
    await GroupService.leave_group(group_id, user["id"])
    return success_response("Left group")


@router.post("/{group_id}/admins/{target_user_id}")
async def promote_admin(
    group_id: str,
    target_user_id: str,
    user: dict = Depends(get_current_user),
):
    await GroupService.promote_admin(group_id, user["id"], target_user_id)
    return success_response("Admin promoted")


@router.delete("/{group_id}/admins/{target_user_id}")
async def demote_admin(
    group_id: str,
    target_user_id: str,
    user: dict = Depends(get_current_user),
):
    await GroupService.demote_admin(group_id, user["id"], target_user_id)
    return success_response("Admin demoted")


@router.delete("/{group_id}")
async def delete_group(group_id: str, user: dict = Depends(get_current_user)):
    await GroupService.delete_group(group_id, user["id"])
    return success_response("Group deleted")


@router.patch("/{group_id}/permissions")
async def update_permissions(
    group_id: str,
    body: GroupPermissionsUpdate,
    user: dict = Depends(get_current_user),
):
    updates = {
        k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None
    }
    if not updates:
        return success_response("Nothing to update")
    # nest under group_permissions
    nested = {f"group_permissions.{k}": v for k, v in updates.items()}
    group = await GroupService.update_group(group_id, user["id"], nested)
    return success_response("Permissions updated", group)
