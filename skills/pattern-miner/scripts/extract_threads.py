#!/usr/bin/env python3
"""
Extract and format threads from Figma comments for LLM analysis.

Filters for threads with substantial debate (configurable min replies).
Outputs formatted threads ready for pattern mining analysis.

Usage:
    python extract_threads.py comments.json --min-replies 4 --output threads.json
"""

import argparse
import json
from collections import defaultdict


def build_threads(comments: list[dict]) -> list[dict]:
    """Build thread structures from flat comment list."""
    thread_map = defaultdict(lambda: {"parent": None, "replies": []})

    for c in comments:
        parent_id = c.get("parent_id", "")
        if parent_id:
            thread_map[parent_id]["replies"].append(c)
        else:
            thread_map[c["id"]]["parent"] = c

    threads = []
    for thread_id, data in thread_map.items():
        parent = data["parent"]
        if not parent:
            continue

        replies = sorted(data["replies"], key=lambda x: x["created_at"])

        threads.append({
            "thread_id": thread_id,
            "order_id": parent.get("order_id", "N/A"),
            "node_id": parent.get("client_meta", {}).get("node_id") if parent.get("client_meta") else None,
            "reply_count": len(replies),
            "participants": list({m["user"]["handle"] for m in [parent] + replies}),
            "messages": [
                {
                    "author": m["user"]["handle"],
                    "text": m["message"],
                    "timestamp": m["created_at"][:10]
                }
                for m in [parent] + replies
            ]
        })

    return threads


def format_for_llm(thread: dict) -> str:
    """Format a thread for LLM analysis."""
    lines = [
        f"Thread #{thread['order_id']} ({thread['reply_count']} replies)",
        f"Node: {thread['node_id'] or 'N/A'}",
        f"Participants: {', '.join(thread['participants'])}",
        "",
        "Messages:"
    ]

    for i, msg in enumerate(thread["messages"]):
        prefix = "" if i == 0 else "  → "
        lines.append(f"{prefix}{msg['author']} ({msg['timestamp']}): {msg['text']}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Extract threads for pattern mining")
    parser.add_argument("input", help="Comments JSON file")
    parser.add_argument("--min-replies", type=int, default=4, help="Minimum replies to include")
    parser.add_argument("--max-threads", type=int, default=50, help="Max threads to output")
    parser.add_argument("--output", "-o", default="threads.json", help="Output file")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format")
    args = parser.parse_args()

    with open(args.input, "r") as f:
        data = json.load(f)

    comments = data.get("comments", [])
    file_key = data.get("file_key", "unknown")

    print(f"Processing {len(comments)} comments from file: {file_key}")

    # Build threads
    threads = build_threads(comments)
    print(f"Found {len(threads)} threads")

    # Filter by reply count
    significant = [t for t in threads if t["reply_count"] >= args.min_replies]
    significant.sort(key=lambda t: t["reply_count"], reverse=True)
    print(f"Threads with {args.min_replies}+ replies: {len(significant)}")

    # Limit output
    if len(significant) > args.max_threads:
        print(f"Limiting to top {args.max_threads} threads by reply count")
        significant = significant[:args.max_threads]

    if args.format == "json":
        output = {
            "file_key": file_key,
            "total_comments": len(comments),
            "threads_extracted": len(significant),
            "min_replies": args.min_replies,
            "threads": significant
        }
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
    else:
        # Text format for direct LLM input
        with open(args.output, "w") as f:
            f.write(f"# Threads from {file_key}\n\n")
            f.write(f"Total: {len(significant)} threads with {args.min_replies}+ replies\n\n")
            f.write("=" * 80 + "\n\n")
            for thread in significant:
                f.write(format_for_llm(thread))
                f.write("\n\n" + "-" * 80 + "\n\n")

    print(f"Saved to {args.output}")


if __name__ == "__main__":
    main()
