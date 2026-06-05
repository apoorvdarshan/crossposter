#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path


MAX_MEDIA_UPLOAD_ATTEMPTS = 2


def emit(payload, code=0):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(code)


def error_message(exc):
    name = exc.__class__.__name__
    text = str(exc).strip()
    lowered = f"{name} {text}".lower()

    if name == "TwoFactorRequired":
        return (
            "Instagram requires 2FA. Add the current code to INSTAGRAM_2FA_CODE for this "
            "profile, save config, publish once, then clear the code."
        )

    if any(
        marker in lowered
        for marker in [
            "challenge",
            "checkpoint",
            "challenge_context",
            "bloks_action",
            "suspicious",
            "verification"
        ]
    ):
        return (
            "Instagram verification is required for this account. Open Instagram for this "
            "account, complete the challenge or checkpoint, then try again. If it repeats, "
            "wait a while or delete this account's session JSON file so Crossposter can "
            "create a fresh session."
        )

    if name in {"PleaseWaitFewMinutes", "FeedbackRequired"}:
        return "Instagram rate-limited this account. Wait a while before publishing again."

    if name == "LoginRequired":
        return "Instagram session is invalid. Re-login with username/password and save a new session."

    if name == "BadPassword":
        return "Instagram password is invalid for this profile."

    if any(marker in lowered for marker in ["moviepy", "ffmpeg", "video thumbnail"]):
        return (
            "Instagram video upload dependencies are missing. Run "
            "`crossposter install-instagram-deps` or `./scripts/install-instagram-deps.sh` in Terminal, then try again."
        )

    if "media_needs_reupload" in lowered:
        return (
            "Instagram rejected the video after upload and asked for a re-upload. "
            "Crossposter retried once; try again later or use a shorter standard MP4/Reel video."
        )

    if len(text) > 240:
        text = f"{text[:237]}..."

    return f"{name}: {text}" if text else name


def parse_args():
    parser = argparse.ArgumentParser(description="Publish a local media post with instagrapi.")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--session-file", required=True)
    parser.add_argument("--media", required=True)
    parser.add_argument("--kind", choices=["image", "video"], required=True)
    parser.add_argument("--caption", default="")
    parser.add_argument("--verification-code", default="")

    return parser.parse_args()


def media_code(media):
    code = getattr(media, "code", None)

    if code:
        return code

    if hasattr(media, "dict"):
        data = media.dict()
        value = data.get("code")

        if value:
            return value

    if isinstance(media, dict):
        return media.get("code")

    return None


def is_media_reupload_error(exc):
    text = f"{exc.__class__.__name__} {str(exc)}".lower()

    return "media_needs_reupload" in text


def remove_generated_thumbnail(media_path):
    Path(f"{media_path}.jpg").unlink(missing_ok=True)


def upload_media(client, args, media_path):
    if args.kind == "image":
        return client.photo_upload(media_path, caption=args.caption)

    last_error = None

    for attempt in range(MAX_MEDIA_UPLOAD_ATTEMPTS):
        try:
            remove_generated_thumbnail(media_path)
            return client.clip_upload(media_path, caption=args.caption, configure_timeout=6)
        except Exception as exc:
            last_error = exc

            if not is_media_reupload_error(exc) or attempt + 1 >= MAX_MEDIA_UPLOAD_ATTEMPTS:
                raise

            time.sleep(4)

    raise last_error


def main():
    args = parse_args()
    session_path = Path(args.session_file).expanduser()
    media_path = Path(args.media).expanduser()

    if not media_path.exists():
        emit({"ok": False, "message": "Instagram media file was not found."}, 2)

    try:
        from instagrapi import Client
    except ModuleNotFoundError:
        emit(
            {
                "ok": False,
                "message": (
                    "instagrapi is not installed. Run "
                    "`crossposter install-instagram-deps` or `./scripts/install-instagram-deps.sh` in Terminal."
                ),
            },
            2,
        )

    session_path.parent.mkdir(parents=True, exist_ok=True)
    client = Client()

    if session_path.exists():
        try:
            client.load_settings(str(session_path))
        except Exception:
            pass

    try:
        login_kwargs = {}

        if args.verification_code:
            login_kwargs["verification_code"] = args.verification_code

        client.login(args.username, args.password, **login_kwargs)
        client.dump_settings(str(session_path))

        media = upload_media(client, args, media_path)

        client.dump_settings(str(session_path))
    except Exception as exc:
        emit({"ok": False, "message": error_message(exc)}, 1)

    code = media_code(media)

    emit(
        {
            "ok": True,
            "message": f"Published with {args.kind}",
            **(
                {"url": f"https://www.instagram.com/{'reel' if args.kind == 'video' else 'p'}/{code}/"}
                if code
                else {}
            ),
            **({"code": code} if code else {}),
        }
    )


if __name__ == "__main__":
    main()
