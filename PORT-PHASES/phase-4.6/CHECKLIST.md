# Phase 4.6 Checklist

**Status:** Not Started

---

## Prerequisites

- [x] Phase 4.5 complete (6 tools migrated + tools.spawn + performance)
- [ ] Review Phase 4.6 plan

---

## Tool 1: view_image

- [ ] Read codex-rs/core/src/tools/handlers/view_image.rs
- [ ] Create codex-ts/src/tools/view-image/index.ts
- [ ] Port ViewImageHandler logic
- [ ] Validate image path exists
- [ ] Inject image into conversation (integrate with existing image handling)
- [ ] Create tests (10 tests)
- [ ] Test path validation
- [ ] Test image injection
- [ ] Add to tool registry
- [ ] Verify tests passing

---

## Tool 2: plan

- [ ] Read codex-rs/core/src/tools/handlers/plan.rs
- [ ] Create codex-ts/src/tools/plan/index.ts
- [ ] Port PLAN_TOOL spec
- [ ] Port handle_update_plan function
- [ ] Parse UpdatePlanArgs (from protocol/plan_tool)
- [ ] Emit plan events
- [ ] Create tests (15 tests)
- [ ] Test plan parsing
- [ ] Test event emission
- [ ] Test validation (only one in_progress step)
- [ ] Add to tool registry
- [ ] Verify tests passing

---

## Tool 3: mcp_resource

- [ ] Read codex-rs/core/src/tools/handlers/mcp_resource.rs
- [ ] Create codex-ts/src/tools/mcp-resource/index.ts
- [ ] Port list_mcp_resources operation
- [ ] Port list_mcp_resource_templates operation
- [ ] Port read_mcp_resource operation
- [ ] Integrate with MCP connection manager
- [ ] Handle server aggregation (all servers vs specific)
- [ ] Create tests (25 tests)
- [ ] Test each operation
- [ ] Test server filtering
- [ ] Test error handling
- [ ] Add to tool registry
- [ ] Verify tests passing

---

## Tool 4: web_search

⚠️ **STOP HERE if web search specs not ready**

- [ ] Check if user provided web_search API specifications
- [ ] If NOT ready: STOP, inform user, wait for specs
- [ ] If ready: Read specifications
- [ ] Create codex-ts/src/tools/web-search/index.ts
- [ ] Implement per specifications
- [ ] Create tests (15 tests)
- [ ] Verify tests passing
- [ ] Add to tool registry

---

## Tool Pack System

### Implementation
- [ ] Create codex-ts/src/tools/packs.ts
- [ ] Define TOOL_PACKS constant with named collections
- [ ] Define default packs (core-codex, anthropic-standard, file-ops, research)
- [ ] Implement getToolsFromPack() function
- [ ] Update ToolFacadeConfig to support toolPack option
- [ ] Update createToolsProxy to handle pack lookup
- [ ] Create tests (15 tests)
- [ ] Test pack lookup
- [ ] Test pack expansion
- [ ] Test unknown pack error
- [ ] Test custom packs
- [ ] Verify tests passing

### Integration
- [ ] Wire pack system into orchestrator
- [ ] Update config schema to include tool packs
- [ ] Document pack system in configuration guide
- [ ] Create example pack configurations

---

## Tool Registry Enhancement

- [ ] Update codex-ts/src/tools/registry.ts
- [ ] Register all 10 tools:
  - applyPatch
  - exec
  - fileSearch
  - readFile
  - listDir
  - grepFiles
  - viewImage
  - plan
  - mcpResource
  - webSearch
- [ ] Add tool metadata (description, schema, approval requirements)
- [ ] Add provider-specific tool variants support (for future Claude-optimized tools)
- [ ] Create tests (10 tests)
- [ ] Verify all tools accessible
- [ ] Verify tests passing

---

## Final

- [ ] All 10 tools implemented
- [ ] Tool pack system working
- [ ] All tests passing
- [ ] Registry complete
- [ ] Update PORT_LOG_MASTER.md
- [ ] Commit and push
- [ ] Phase 4.6 COMPLETE!
