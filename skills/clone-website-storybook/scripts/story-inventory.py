#!/usr/bin/env python3
"""Story inventory for the prune step.
  story-inventory.py snap <out.json> [src]     record every story (name, has play, expect count) per stories file
  story-inventory.py diff <before.json> <after.json>
Diff prints removed / added stories per file and FAILS (exit 1) if any file lost `expect(` assertions or a `play` proof:
pruning removes duplicate stories, never checks."""
import glob, json, re, sys

def snap(src):
    out = {}
    for f in sorted(glob.glob(f'{src}/**/*.stories.tsx', recursive=True)):
        s = open(f).read()
        chunks = re.split(r'\n(?=(?:/\*\*[^\n]*\*/\n)?export const )', s)
        stories = {}
        for c in chunks[1:]:
            m = re.match(r'(?:/\*\*[^\n]*\*/\n)?export const (\w+)', c)
            if m:
                stories[m.group(1)] = {'play': 'play:' in c, 'expects': len(re.findall(r'\bexpect\(', c))}
        out[f] = {'stories': stories, 'expects': len(re.findall(r'\bexpect\(', s))}
    return out

def diff(a, b):
    bad = 0; before = sum(len(v['stories']) for v in a.values()); after = sum(len(v['stories']) for v in b.values())
    for f in sorted(set(a) | set(b)):
        A, B = a.get(f, {'stories': {}, 'expects': 0}), b.get(f, {'stories': {}, 'expects': 0})
        gone = sorted(set(A['stories']) - set(B['stories'])); new = sorted(set(B['stories']) - set(A['stories']))
        lost = A['expects'] - B['expects']
        played = any(v['play'] for v in A['stories'].values()) and not any(v['play'] for v in B['stories'].values())
        if gone or new or lost or played:
            print(f"{f}: -{len(gone)} {gone}  +{len(new)} {new}  expects {A['expects']} -> {B['expects']}" + ('  LOST ASSERTIONS' if lost > 0 else '') + ('  LOST PLAY' if played else ''))
        if lost > 0 or played: bad += 1
    print(f"\nstories {before} -> {after}; files losing assertions or play: {bad}")
    return 1 if bad else 0

if __name__ == '__main__':
    if sys.argv[1] == 'snap':
        json.dump(snap(sys.argv[3] if len(sys.argv) > 3 else 'src'), open(sys.argv[2], 'w'), indent=1)
    else:
        sys.exit(diff(json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))))
