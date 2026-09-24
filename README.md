# ITDR — Phase 2

DR plans, bound DR Tests, derived **ready**, and an operational dashboard. Crisis invocation is still deferred. Testing owns the calendar.

## Run

```powershell
cd itdr
.\scripts\test.ps1
.\scripts\start.ps1
```

Open http://127.0.0.1:8787/itdr (or the port printed in the console).

## Demo

1. **Admin** — assign owners and strategy on Payments Gateway  
2. **Plan Owner** — draft from template, contact names, submit  
3. **Approver** — publish (creates a DR Test in Testing; does not make the plan `ready`)  
4. **Test Manager** — BCM **Testing** module → Record pass (actual RTO/RPO must meet target)  
5. **Executive** — ITDR **Dashboard** — drill a KPI tile to plan version + test id  

## In / out of this phase

| In Phase 2 | Not yet |
|---|---|
| `DR Test` type beside BCP Test | Crisis invocation |
| Create-on-publish / create-on-due (Testing remains scheduler) | ISO 22301/27031 pack (Phase 3) |
| Bound results only; unbound/BCP ignored | User-set `ready` |
| `ready` / `failed_test` / operational dashboard | ITDR-owned test calendar |
