#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


def emit(payload, code=0):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(code)


def error_message(exc):
    name = exc.__class__.__name__
    text = str(exc).strip()

    if name == "TwoFactorRequired":
        return (
            "Instagram requires 2FA. Add the current code to INSTAGRAM_2FA_CODE for this "
            "profile, save config, publish once, then clear the code."
        )

    if name == "ChallengeRequired":
        return (
            "Instagram requires account verification. Open Instagram for this account, "
            "complete the challenge, then try again."
        )

    if name in {"PleaseWaitFewMinutes", "FeedbackRequired"}:
        return "Instagram rate-limited this account. Wait a while before publishing again."

    if name == "LoginRequired":
        return "Instagram session is invalid. Re-login with username/password and save a new session."

    if name == "BadPassword":
        return "Instagram password is invalid for this profile."

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
                    "`python3 -m pip install --user instagrapi` in Terminal."
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

        if args.kind == "image":
            media = client.photo_upload(media_path, caption=args.caption)
        else:
            media = client.video_upload(media_path, caption=args.caption)

        client.dump_settings(str(session_path))
    except Exception as exc:
        emit({"ok": False, "message": error_message(exc)}, 1)

    code = media_code(media)

    emit(
        {
            "ok": True,
            "message": f"Published with {args.kind}",
            **({"url": f"https://www.instagram.com/p/{code}/"} if code else {}),
            **({"code": code} if code else {}),
        }
    )


if __name__ == "__main__":
    main()
