
## Project posture: PoC, no backwards-compatibility drag

Co-op Source Network is a proof-of-concept project and has never been in production. Do not version internal code artifacts solely for backwards compatibility. Avoid names such as `SpaceRefV2`, `FooV2`, or compatibility wrappers unless the user explicitly asks for a migration bridge.

Backwards compatibility with prior PoC code is counterproductive. Existing production-migration concerns do not apply unless explicitly introduced later.

