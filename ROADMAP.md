# AtomicMemory Integrations Roadmap

This roadmap is directional. It describes the areas the maintainers are actively investing in, but it is not a promise of specific features or dates.

AtomicMemory Integrations contains agent, CLI, MCP, and workflow integration surfaces for AtomicMemory. The near-term focus is making integrations easy to install, easy to diagnose, and thin enough that memory behavior remains owned by the SDK and Core.

## Current Focus

- Provide practical integrations for coding agents and agent workflows.
- Keep integration layers thin, with core memory behavior delegated to AtomicMemory SDKs and Core.
- Improve install, configuration, and diagnostic flows.
- Make MCP and agent-facing tools predictable and well documented.
- Add examples that show end-to-end capture and retrieval in realistic workflows.
- Strengthen public repository readiness with templates, metadata, docs links, and contributor guidance.

## Near-Term Work

### MCP And Agent Tools

- Stabilize the MCP server surface for capture, retrieval, search, and context injection workflows.
- Improve tool descriptions so agent clients can call memory tools reliably.
- Add examples for common agent setups.
- Document security and scope expectations for local and remote usage.

### Install And Diagnostics

- Add clearer setup paths for supported package managers and runtime environments.
- Improve doctor-style checks for configuration, connectivity, and provider setup.
- Make common failure modes actionable through error messages and troubleshooting docs.
- Keep examples aligned with the docs site.

### Integration Coverage

- Expand integrations where they support real developer workflows.
- Keep provider and platform-specific adapters small and testable.
- Document what each integration owns versus what belongs in SDK or Core.
- Add compatibility notes for supported agent clients and runtimes.

### Security And Trust Boundaries

- Document local file, workspace, and credential handling expectations.
- Keep defaults conservative for what an integration can read, write, or send.
- Make user-controlled configuration explicit.
- Avoid storing sensitive data in integration-specific state unless the behavior is documented and necessary.

## Later Work

- Additional agent-framework adapters based on usage and contributor demand.
- Richer context assembly workflows for multi-session projects.
- Better integration test fixtures for local agent and MCP clients.
- More examples for hosted Core, self-hosted Core, and local development setups.

## Contribution Areas

Good first areas for contributors include:

- Integration setup examples for supported tools.
- MCP tool description improvements.
- Reproductions for install, configuration, or runtime failures.
- Small adapters that follow the existing integration boundaries.
- Tests that verify command behavior and tool contracts.

## Non-Goals

- Integrations should not reimplement Core memory behavior.
- Integrations should not become the canonical place for SDK business logic.
- Integrations should not assume one specific hosted deployment.
- Integrations should not expose private internal benchmark, launch, or customer-specific planning.

## How We Prioritize

We prioritize integrations that make AtomicMemory usable in real agent workflows while keeping the implementation simple, auditable, and grounded in the SDK/Core contract.
