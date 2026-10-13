# Forwarded Events → JSON collector (Active Directory activity)

Reads the Windows **Forwarded Events** log on your Windows Event Collector, turns AD-related
Security events into readable activity records, and keeps one JSON file up to date every 15 minutes.

## Files
| File | Purpose |
|---|---|
| `collector.js` | The collector (Node.js 18+, no npm packages needed) |
| `register-task.ps1` | Installs the collector and schedules it every 15 minutes as SYSTEM |
| `package.json` | Project metadata (`npm run collect` runs one verbose collection) |

## Quick start (elevated PowerShell on the collector machine)
Extract `forwarded-events-collector.zip` on the collector machine, then open an elevated PowerShell window in the extracted folder.

```powershell
# If PowerShell refuses to run the script because the zip came from the internet:
Unblock-File .\register-task.ps1

# 1. Try one run
node collector.js --verbose

# 2. Schedule it every 15 minutes
.\register-task.ps1
```

## Where things go
| Path | Contents |
|---|---|
| `C:\UnoChariot\data\ad-forwarded-events.json` | The events (safe to mount read-only into Docker) |
| `C:\UnoChariot\data\forwarded-collector-status.json` | Last run result: success/failure, counts, errors |
| `C:\UnoChariot\state\ForwardedEvents.bookmark.xml` | Read position (delete it to re-collect from the lookback window) |
| `C:\UnoChariot\logs\` | Daily logs, kept 14 days |

## Options
| Option | Default | Meaning |
|---|---|---|
| `--base-dir <dir>` | `C:\UnoChariot` | Root for data, state and logs |
| `--output <file>` | `ad-forwarded-events.json` | Output file name |
| `--channel <name>` | `ForwardedEvents` | Event log to read |
| `--all-events` | off | Keep every event ID, not just AD activity |
| `--include-machine-accounts` | off | Keep logon noise from computer accounts (`NAME$`) |
| `--lookback-hours <n>` | 24 | How far back the first run reads |
| `--retention-days <n>` | 7 | Drop events older than this |
| `--max-events <n>` | 200000 | Maximum events kept in the file |
| `--batch-size <n>` | 5000 | Events per read |
| `--max-per-run <n>` | 100000 | Remaining backlog is read on the next run |
| `--include-message` | off | Include the full event message text (bigger file) |
| `--verbose` | off | Print progress to the console |

Pass options to the scheduled task with:
`.\register-task.ps1 -ExtraArguments '--retention-days 14'`

## Requirements
- Node.js 18+ installed machine-wide (`C:\Program Files\nodejs`) so SYSTEM can run it.
- Run as Administrator/SYSTEM, or as a member of **Event Log Readers**.
- The Event Forwarding subscription must forward the event IDs you want (Subscriptions → Properties
  → Select Events), and the source DCs need the matching audit policies enabled.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Access denied reading 'ForwardedEvents'` | Run elevated, or add the account to Event Log Readers |
| PowerShell will not run `register-task.ps1` | The file came from the internet. Run `Unblock-File .\register-task.ps1`, then run the script again |
| `node.exe not found` | Install Node.js LTS for all users, then reopen PowerShell |
| No account/group change events | Add 4720–4767 and 5136–5141 to the subscription and enable auditing on the DCs |
| Task not running | `Get-ScheduledTaskInfo 'Forwarded Events AD Collector'` and check `C:\UnoChariot\logs\` |
| `Another run is active; skipping.` | Normal if runs overlap; a stale lock clears itself after 30 minutes |
# AF
