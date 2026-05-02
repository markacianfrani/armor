#!/usr/bin/env python3
"""
Fetch comments from a Figma file via REST API.

Usage:
    python fetch_comments.py <file_key> --output comments.json

Requires:
    FIGMA_PAT environment variable with Personal Access Token
    Token needs: files:read, file_comments:read scopes
"""

import argparse
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def fetch_comments(file_key: str, token: str) -> dict:
    """Fetch all comments from a Figma file."""
    url = f"https://api.figma.com/v1/files/{file_key}/comments"

    req = Request(url)
    req.add_header("X-Figma-Token", token)

    try:
        with urlopen(req) as response:
            return json.loads(response.read().decode())
    except HTTPError as e:
        if e.code == 403:
            print("Error: Access denied. Check your token has file_comments:read scope.", file=sys.stderr)
        elif e.code == 404:
            print(f"Error: File not found: {file_key}", file=sys.stderr)
        else:
            print(f"Error: HTTP {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(1)


def fetch_file_metadata(file_key: str, token: str) -> dict:
    """Fetch basic file metadata (name, last modified)."""
    url = f"https://api.figma.com/v1/files/{file_key}?depth=1"

    req = Request(url)
    req.add_header("X-Figma-Token", token)

    try:
        with urlopen(req) as response:
            data = json.loads(response.read().decode())
            return {
                "name": data.get("name", "Unknown"),
                "lastModified": data.get("lastModified"),
                "version": data.get("version")
            }
    except HTTPError:
        return {"name": "Unknown", "lastModified": None, "version": None}


def main():
    parser = argparse.ArgumentParser(description="Fetch Figma comments for pattern mining")
    parser.add_argument("file_key", help="Figma file key (from URL)")
    parser.add_argument("--output", "-o", default="comments.json", help="Output file path")
    parser.add_argument("--include-metadata", "-m", action="store_true", help="Include file metadata")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_PAT")
    if not token:
        print("Error: FIGMA_PAT environment variable not set", file=sys.stderr)
        print("Generate a token at: https://www.figma.com/settings", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching comments from file: {args.file_key}")
    comments_data = fetch_comments(args.file_key, token)

    output = {
        "file_key": args.file_key,
        "comments": comments_data.get("comments", [])
    }

    if args.include_metadata:
        print("Fetching file metadata...")
        output["metadata"] = fetch_file_metadata(args.file_key, token)

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    comment_count = len(output["comments"])
    print(f"Saved {comment_count} comments to {args.output}")

    # Quick stats
    threaded = sum(1 for c in output["comments"] if c.get("parent_id"))
    with_context = sum(1 for c in output["comments"] if c.get("client_meta"))

    print(f"  - Threaded replies: {threaded} ({threaded/comment_count*100:.1f}%)")
    print(f"  - With node context: {with_context} ({with_context/comment_count*100:.1f}%)")


if __name__ == "__main__":
    main()
