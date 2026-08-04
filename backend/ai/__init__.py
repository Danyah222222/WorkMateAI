"""AI capability framework for WorkMate.

The AI planner (Haiku) inspects the user's message and returns a plan of
0-3 capability calls. The executor runs each one server-side with the
authenticated user so every capability enforces:
  - Workspace isolation (company_id)
  - Role permissions (min_role)
  - Never trusts model-supplied identity

To add a new capability: create a module, define an async handler, and call
`register(Capability(...))`. Then import the module in
`capabilities/__init__.py` so it self-registers at import time.
"""
