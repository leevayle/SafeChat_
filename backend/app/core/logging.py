"""Structured logging — three brand dots, timestamp, action."""
import logging
import sys
from app.core.config import settings

_RED = "\033[38;2;227;64;76m"      # #E3404C Safe
_PURPLE = "\033[38;2;138;43;226m"  # #8A2BE2 Chat
_BLUE = "\033[38;2;89;132;242m"    # #5984F2 dot
_RESET = "\033[0m"
_DIM = "\033[2m"

_configured = False


class SafeChatFormatter(logging.Formatter):
    """● ● ●  timestamp - message"""

    def format(self, record: logging.LogRecord) -> str:
        dots = f"{_RED}●{_RESET} {_PURPLE}●{_RESET} {_BLUE}●{_RESET}"
        ts = self.formatTime(record, self.datefmt)
        msg = record.getMessage()
        for prefix in ("Boot · ", "Shutdown · ", "Boot ·"):
            if msg.startswith(prefix):
                msg = msg[len(prefix):].strip()
                break
        if record.levelno >= logging.ERROR:
            body = f"{_RED}{msg}{_RESET}"
        elif record.levelno >= logging.WARNING:
            body = f"\033[38;2;232;93;4m{msg}{_RESET}"
        else:
            body = msg
        return f"{dots}  {_DIM}{ts}{_RESET} - {body}"


def print_boot_dots() -> None:
    """Three SafeChat dots, one per line, before any boot work."""
    print(f"{_RED}●{_RESET}", flush=True)
    print(f"{_PURPLE}●{_RESET}", flush=True)
    print(f"{_BLUE}●{_RESET}", flush=True)
    print(flush=True)


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    _configured = True
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(SafeChatFormatter(datefmt="%Y-%m-%d %H:%M:%S"))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    for name in (
        "uvicorn.access",
        "uvicorn.error",
        "motor",
        "pymongo",
        "pymongo.topology",
        "pymongo.connection",
        "pymongo.command",
        "asyncio",
        "httpx",
        "httpcore",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)

    logging.getLogger("app.api").setLevel(logging.WARNING)
    logging.getLogger("app.services").setLevel(logging.WARNING)
    logging.getLogger("app.websocket").setLevel(logging.WARNING)
    logging.getLogger("app.middleware").setLevel(logging.WARNING)
    logging.getLogger("app.core.database").setLevel(logging.INFO)
    logging.getLogger("app.main").setLevel(logging.INFO)
