"""Contacts and contact-request endpoints."""
from fastapi import APIRouter, Depends, status
from app.api.deps import get_current_user
from app.schemas.contacts import ContactRequestCreate, ContactNicknameUpdate
from app.services.contact_service import ContactService
from app.core.exceptions import success_response

router = APIRouter(prefix="/contacts", tags=["Contacts"])


@router.get("")
async def list_contacts(user: dict = Depends(get_current_user)):
    contacts = await ContactService.list_contacts(user["id"])
    return success_response("Contacts", contacts)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def send_contact_request(
    body: ContactRequestCreate,
    user: dict = Depends(get_current_user),
):
    result = await ContactService.send_request(
        user["id"],
        body.to_username,
        body.message,
        share_phone=getattr(body, "share_phone", False),
        from_nickname=getattr(body, "from_nickname", None),
    )
    return success_response("Contact request sent", result)


@router.get("/requests/incoming")
async def list_incoming_requests(user: dict = Depends(get_current_user)):
    items = await ContactService.list_incoming_requests(user["id"])
    return success_response("Incoming requests", items)


@router.get("/requests/outgoing")
async def list_outgoing_requests(user: dict = Depends(get_current_user)):
    items = await ContactService.list_outgoing_requests(user["id"])
    return success_response("Outgoing requests", items)


@router.post("/requests/{request_id}/accept")
async def accept_request(request_id: str, user: dict = Depends(get_current_user)):
    result = await ContactService.accept_request(request_id, user["id"])
    return success_response("Request accepted", result)


@router.post("/requests/{request_id}/reject")
async def reject_request(request_id: str, user: dict = Depends(get_current_user)):
    result = await ContactService.reject_request(request_id, user["id"])
    return success_response("Request rejected", result)


@router.delete("/{contact_user_id}")
async def remove_contact(contact_user_id: str, user: dict = Depends(get_current_user)):
    await ContactService.remove_contact(user["id"], contact_user_id)
    return success_response("Contact removed")


@router.patch("/{contact_user_id}/nickname")
async def update_nickname(
    contact_user_id: str,
    body: ContactNicknameUpdate,
    user: dict = Depends(get_current_user),
):
    result = await ContactService.update_nickname(
        user["id"], contact_user_id, body.nickname
    )
    return success_response("Nickname updated", result)


@router.post("/block/{user_id}")
async def block_user(user_id: str, user: dict = Depends(get_current_user)):
    await ContactService.block_user(user["id"], user_id)
    return success_response("User blocked")


@router.delete("/block/{user_id}")
async def unblock_user(user_id: str, user: dict = Depends(get_current_user)):
    await ContactService.unblock_user(user["id"], user_id)
    return success_response("User unblocked")
