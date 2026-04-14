from pathlib import Path

from app.core.settings import BASE_DIR, settings


def get_upload_dir() -> Path:
    upload_dir = Path(settings.UPLOAD_DIR)
    if not upload_dir.is_absolute():
        upload_dir = (BASE_DIR / upload_dir).resolve()
    return upload_dir


def ensure_upload_dir() -> Path:
    upload_dir = get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def build_upload_path(filename: str) -> Path:
    return ensure_upload_dir() / filename


def upload_path_to_url(path: str) -> str:
    if not path:
        return ""

    try:
        stored_path = Path(path)
        if not stored_path.is_absolute():
            stored_path = (BASE_DIR / stored_path).resolve()
        upload_dir = get_upload_dir().resolve()
        if stored_path == upload_dir or upload_dir in stored_path.parents:
            relative_path = stored_path.relative_to(upload_dir).as_posix()
            return f"/uploads/{relative_path}"
    except Exception:
        pass

    normalized_path = path.replace("\\", "/")
    if "/uploads/" in normalized_path:
        return normalized_path[normalized_path.index("/uploads/"):]
    return f"/uploads/{Path(normalized_path).name}"
