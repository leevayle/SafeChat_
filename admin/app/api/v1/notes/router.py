"""Notes / checklists / reminders API — cross-device sync."""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List, Any, Dict
from app.api.deps import get_current_user
from app.services.notes_service import NotesService
from app.core.exceptions import success_response

router = APIRouter(prefix="/notes", tags=["Notes"])


@router.get("")
async def list_notes(
    kind: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    items = await NotesService.list_notes(user["id"], kind=kind)
    return success_response("Notes", {"notes": items})


@router.post("")
async def create_note(body: Dict[str, Any], user: dict = Depends(get_current_user)):
    note = await NotesService.create_note(user["id"], body or {})
    return success_response("Note created", note)


@router.put("/{note_id}")
async def update_note(
    note_id: str,
    body: Dict[str, Any],
    user: dict = Depends(get_current_user),
):
    note = await NotesService.update_note(user["id"], note_id, body or {})
    return success_response("Note updated", note)


@router.delete("/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    await NotesService.delete_note(user["id"], note_id)
    return success_response("Note deleted")


@router.post("/sync")
async def sync_notes(body: Dict[str, Any], user: dict = Depends(get_current_user)):
    """Upload local notes (migration). Returns full server list."""
    local = (body or {}).get("notes") or []
    if local:
        await NotesService.bulk_upsert(user["id"], local)
    items = await NotesService.list_notes(user["id"])
    return success_response("Notes synced", {"notes": items})
