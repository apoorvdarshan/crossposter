#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def emit(payload, code=0):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(code)


def error_message(exc):
    name = exc.__class__.__name__
    text = str(exc).strip()
    lowered = f"{name} {text}".lower()

    if "module" in lowered and "py3pin" in lowered:
        return "py3-pinterest is not installed. Run `crossposter install-pinterest-deps` or `./scripts/install-pinterest-deps.sh` in Terminal."

    if any(marker in lowered for marker in ["401", "403", "unauthorized", "forbidden"]):
        return (
            "Pinterest rejected this session. Open Pinterest in a browser for this account, "
            "confirm it is not blocked by a challenge, then try again. If it repeats, delete "
            "this profile's Pinterest session folder so Crossposter can create fresh cookies."
        )

    if any(marker in lowered for marker in ["captcha", "challenge", "verification", "suspicious"]):
        return (
            "Pinterest requires browser verification for this account. Open Pinterest manually, "
            "complete the challenge, then try again. If headless login fails, set Pinterest "
            "headless login to false."
        )

    if any(marker in lowered for marker in ["chromedriver", "selenium", "chrome"]):
        return (
            "Pinterest login uses Chrome through py3-pinterest. Install Google Chrome, run "
            "`crossposter install-pinterest-deps` or `./scripts/install-pinterest-deps.sh`, then try again."
        )

    if any(marker in lowered for marker in ["ffprobe", "ffmpeg", "could not probe video"]):
        return "Pinterest video upload needs ffmpeg and ffprobe on PATH, or use an image Pin."

    if "timed out" in lowered:
        return "Pinterest publish timed out. Try again, or increase Pinterest timeout in Settings."

    if len(text) > 240:
        text = f"{text[:237]}..."

    return f"{name}: {text}" if text else name


def parse_args():
    parser = argparse.ArgumentParser(description="Publish a local Pin with py3-pinterest.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--cred-root", required=True)
    parser.add_argument("--board-id", required=True)
    parser.add_argument("--media", required=True)
    parser.add_argument("--kind", choices=["image", "video"], required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--description", default="")
    parser.add_argument("--link", default="")
    parser.add_argument("--section-id", default="")
    parser.add_argument("--alt-text", default="")
    parser.add_argument("--headless", choices=["true", "false"], default="true")

    return parser.parse_args()


def response_json(response):
    if hasattr(response, "json"):
        return response.json()

    if isinstance(response, dict):
        return response

    return {}


def pin_id_from_response(data):
    try:
        return str(data["resource_response"]["data"]["id"])
    except Exception:
        return ""


def main():
    args = parse_args()
    media_path = Path(args.media).expanduser()

    if not media_path.exists():
        emit({"ok": False, "message": "Pinterest media file was not found."}, 2)

    try:
        from py3pin.Pinterest import Pinterest
    except ModuleNotFoundError:
        emit(
            {
                "ok": False,
                "message": "py3-pinterest is not installed. Run `crossposter install-pinterest-deps` or `./scripts/install-pinterest-deps.sh` in Terminal.",
            },
            2,
        )

    cred_root = str(Path(args.cred_root).expanduser())
    Path(cred_root).mkdir(parents=True, exist_ok=True)
    pinterest = Pinterest(
        email=args.email,
        password=args.password,
        username=args.username,
        cred_root=cred_root,
    )

    try:
        pinterest.login(headless=args.headless == "true")

        if args.kind == "image":
            response = pinterest.upload_pin(
                board_id=args.board_id,
                image_file=str(media_path),
                title=args.title,
                description=args.description,
                link=args.link,
                alt_text=args.alt_text,
                section_id=args.section_id or None,
            )
        else:
            response = pinterest.upload_video_pin(
                board_id=args.board_id,
                video_file=str(media_path),
                title=args.title,
                description=args.description,
                link=args.link,
                alt_text=args.alt_text,
            )
    except Exception as exc:
        emit({"ok": False, "message": error_message(exc)}, 1)

    data = response_json(response)
    pin_id = pin_id_from_response(data)

    emit(
        {
            "ok": True,
            "message": f"Published with {args.kind}",
            **({"url": f"https://www.pinterest.com/pin/{pin_id}/"} if pin_id else {}),
            **({"pin_id": pin_id} if pin_id else {}),
        }
    )


if __name__ == "__main__":
    main()
