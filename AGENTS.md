
## Project posture: PoC, no backwards-compatibility drag

Co-op Source Network is a proof-of-concept project and has never been in production. Do not version internal code artifacts solely for backwards compatibility. Avoid names such as `SpaceRefV2`, `FooV2`, or compatibility wrappers unless the user explicitly asks for a migration bridge.

When an architectural type changes, update the canonical type in place and refactor callers. Backwards compatibility with prior PoC code is counterproductive and should not slow the V11 refactor. Existing production-migration concerns do not apply unless explicitly introduced later.

