#!/usr/bin/env python3
"""Small, dependency-free Company OS command line."""
from __future__ import annotations
import datetime as dt, json, pathlib, subprocess, sys, re
ROOT=pathlib.Path(__file__).resolve().parents[2]; OS=ROOT/'.company-os'

def now(): return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def read(name): return json.loads((OS/name).read_text())
def write(name,obj):
    obj['updated_at']=now(); (OS/name).write_text(json.dumps(obj,indent=2)+'\n')
def git(*args):
    return subprocess.run(['git',*args],cwd=ROOT,text=True,capture_output=True).stdout.strip()
def status():
    state=read('PROJECT_STATE.json'); branch=git('branch','--show-current'); dirty=git('status','--short')
    print(f'project: {state["project"]}\nbranch: {branch}\nworking tree: {"dirty" if dirty else "clean"}\nphase: {state["phase"]}\nactive requests: {len(state["active_request_ids"])}\nactive sessions: {len(state["active_session_ids"])}')
def doctor():
    required=['README.md','COMPANY_RULES.md','MASTER_CONTEXT.md','PRODUCT_CONTEXT.md','USER_PREFERENCES.md','CURRENT_STATE.md','PROJECT_STATE.json','SESSION_REGISTRY.json','TASK_GRAPH.json','SKILL_REGISTRY.md','ASSUMPTIONS.md','DECISIONS.md','RISKS.md','BLOCKERS.md','CHANGELOG.md']
    missing=[x for x in required if not (OS/x).exists()]
    try: read('PROJECT_STATE.json'); read('SESSION_REGISTRY.json'); read('TASK_GRAPH.json'); json_ok=True
    except Exception: json_ok=False
    print('company doctor: '+('PASS' if not missing and json_ok else 'FAIL'))
    if missing: print('missing: '+', '.join(missing))
    print('product brief: '+('present' if (ROOT/'docs/SHALIMAR_PRODUCT_BRIEF.md').exists() else 'missing (assumptions required)'))
def request(raw):
    if not raw.strip(): raise SystemExit('company request requires text')
    rid='REQ-'+dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    inbox=OS/'requests/inbox'/f'{rid}-RAW.md'; norm=OS/'requests/normalized'/f'{rid}.md'
    inbox.write_text(raw+'\n')
    norm.write_text(f'''# {rid}\n\n## Original Request\n\n{raw}\n\n## Interpreted Business Goal\n\nTo be refined by product and requirements review using repository evidence.\n\n## User or Staff Affected\n\nTo be confirmed from the product brief and current workflows.\n\n## Current Problem\n\nNot yet verified; preserve the request as the source statement.\n\n## Desired Outcome\n\nA tested, documented outcome satisfying the approved acceptance criteria.\n\n## In Scope\n\n- Discovery, requirements, design, implementation, verification, and handoff as approved.\n\n## Out of Scope\n\n- Production deployment, real customer messaging, paid services, and destructive changes without approval.\n\n## Assumptions\n\n- The product brief is authoritative when present.\n- Missing details remain assumptions until verified.\n\n## Open Questions\n\n- Only material blockers identified during discovery.\n\n## Acceptance Criteria\n\n- Product team records testable criteria before implementation.\n\n## Business Risks\n\n- Scope and integration risks must be assessed before approval.\n\n## Technical Impact\n\n- Assess frontend, backend, database, messaging, AI, security, infrastructure, and documentation.\n\n## Test Requirements\n\n- Run targeted tests plus relevant baseline checks and store evidence.\n\n## Delivery Plan\n\n- Product → architecture/design → implementation → QA/security → independent review.\n''')
    state=read('PROJECT_STATE.json'); state['active_request_ids'].append(rid); write('PROJECT_STATE.json',state)
    print(f'created {rid}\nraw: {inbox.relative_to(ROOT)}\nnormalized: {norm.relative_to(ROOT)}')
def verify():
    out=OS/'evidence/logs'; out.mkdir(parents=True,exist_ok=True); stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S'); path=out/f'company-verify-{stamp}.md'
    lines=[f'# Company OS verification ({now()})','',f'- branch: `{git("branch","--show-current")}`',f'- git status: `{"clean" if not git("status","--short") else "dirty"}`',f'- doctor: run `scripts/company/company doctor`','- safety: no provider calls, production credentials, live sends, or deployments performed.']
    path.write_text('\n'.join(lines)+'\n'); print(path.relative_to(ROOT))
def resume():
    s=read('SESSION_REGISTRY.json'); print(f'resume: {len(s["sessions"])} recorded session(s); native session restoration is unavailable, so inspect handoffs and create successor records as needed.')
def main():
    if len(sys.argv)<2: print('usage: company {init|start|resume|status|request|verify|review|release|recover|doctor}'); return 2
    cmd=sys.argv[1]
    if cmd in ('status','init','start','resume','verify','doctor'): return {'status':status,'init':doctor,'start':resume,'resume':resume,'verify':verify,'doctor':doctor}[cmd]()
    if cmd=='request': return request(' '.join(sys.argv[2:]))
    if cmd in ('review','recover'): print(f'{cmd}: approval-gated workflow; review registry, evidence, and handoffs before proceeding.')
    elif cmd=='release': print('release: blocked until explicit staging/production approval and release evidence are recorded.')
    else: print('unknown command'); return 2
if __name__=='__main__': main()
