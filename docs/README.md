# 📚 Kyvzon Platform Documentation

**Platform:** Kyvzon HR System  
**Version:** 3.0.0  
**Last Updated:** 2026-07-13

---

## Documentation Structure

```
docs/
├── README.md                    ← You are here
├── PLATFORM_STANDARDS.md        ← Coding & architectural standards
├── adr/                         ← Architecture Decision Records
│   ├── INDEX.md
│   ├── ADR_TEMPLATE.md
│   ├── 0001-record-architecture-decisions.md
│   ├── 0002-sdk-layer-architecture.md
│   └── 0003-multi-tenancy-strategy.md
├── reports/                     ← Status and completion reports
│   └── PHASE0_COMPLETION_REPORT.md
└── guides/                      ← Future operational guides
```

---

## Key Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [PLATFORM_STANDARDS.md](PLATFORM_STANDARDS.md) | Coding conventions, folder structure, and rules | All developers |
| [adr/INDEX.md](adr/INDEX.md) | List of all architectural decisions | Architects & Leads |
| [TECHNICAL_DEBT_REGISTER.md](../TECHNICAL_DEBT_REGISTER.md) | Living list of technical debt | Platform team |
| [ENVIRONMENT_STRATEGY.md](../ENVIRONMENT_STRATEGY.md) | How to manage environments and secrets | DevOps + Engineers |
| [PHASE0_COMPLETION_REPORT.md](reports/PHASE0_COMPLETION_REPORT.md) | Summary of risk mitigation phase | Stakeholders |

---

## How to Use This Documentation

1. **New developers** → Start with `PLATFORM_STANDARDS.md`
2. **Architectural changes** → Create a new ADR using the template
3. **Planning sprints** → Review `TECHNICAL_DEBT_REGISTER.md`
4. **Environment setup** → Follow `ENVIRONMENT_STRATEGY.md`

---

## Current Platform Maturity

| Area                    | Score | Trend |
|-------------------------|-------|-------|
| Security                | 7.5/10 | ↑ |
| Architecture            | 9.0/10 | Stable |
| Documentation           | 8.0/10 | ↑ |
| Technical Debt          | 5.5/10 | ↑ |
| Developer Experience    | 7.0/10 | ↑ |

---

**Maintained by:** Platform Architect  
**Review Cycle:** Every 2 weeks during active development phases