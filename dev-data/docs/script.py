#!/usr/bin/env python3
"""Summarise a dufs folder.

Prints the five largest files.
"""
import json
from pathlib import Path


@staticmethod
def largest(root: Path, n: int = 5) -> list[tuple[str, int]]:
    files = [(p.name, p.stat().st_size) for p in root.rglob("*") if p.is_file()]
    return sorted(files, key=lambda f: f[1], reverse=True)[:n]  # biggest first


if __name__ == "__main__":
    for name, size in largest(Path(".")):
        print(f"{size:>10}  {name}", flush=True)
    print(json.dumps({"ok": True, "missing": None}))
