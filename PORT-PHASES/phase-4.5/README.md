# Phase 4.5: Script Harness - Production Hardening

## Overview

Phase 4.5 hardens the script harness for production use with comprehensive security testing, optional isolated-vm runtime, performance optimization, and complete documentation.

**Design Reference:** `/Users/leemoore/code/codex-port-02/SCRIPT_HARNESS_DESIGN_FINAL.md`

**Prerequisites:** Phase 4.4 complete (core implementation working)

## Goals

1. **isolated-vm runtime** - Optional V8-based runtime for high-security
2. **tools.spawn** - Detached task pattern
3. **Security hardening** - Comprehensive threat mitigation
4. **Full test suite** - Expand to 60 tests
5. **Security review** - Red-team testing
6. **Performance** - Optimization and benchmarking
7. **Documentation** - Complete user guides
8. **Production-ready** - GA enablement

## What Gets Added

**Additional Runtime:**
- `runtime/ivm-runtime.ts` - isolated-vm adapter
- Runtime selection via config
- Parity testing between QuickJS and isolated-vm

**Advanced Features:**
- tools.spawn pattern (explicit detached tasks)
- tools.http (if network policy allows)
- Enhanced telemetry and metrics

**Security Hardening:**
- Comprehensive input validation
- Fuzz testing for parser
- Penetration testing
- Security audit
- Red-team dry run

**Testing Expansion:**
- Security tests: 15 → 20 (S16-S20)
- Functional tests: 20 → 30 (F21-F30)
- Integration tests: 5 → 10 (I6-I10)
- **Total: 60 tests**

**Documentation:**
- User guide
- Security model
- Tool API reference
- Configuration guide
- Error catalog
- Operator runbook

**Performance:**
- Worker pool optimization
- Context reuse strategy
- Benchmark suite
- Memory profiling

## Success Criteria

- [ ] isolated-vm runtime working
- [ ] Runtime parity tests pass
- [ ] tools.spawn implemented
- [ ] Full 60 test suite passing
- [ ] Security review complete
- [ ] Red-team signoff
- [ ] Performance targets met (< 100ms overhead)
- [ ] Complete documentation
- [ ] Production deployment plan
- [ ] Feature ready for GA

## Rollout Plan

1. **Alpha:** Dry-run mode only (validation, no execution)
2. **Beta:** Enabled for select models/providers
3. **GA:** Full enablement after security signoff
