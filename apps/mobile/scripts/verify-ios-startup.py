"""Cold-start the compiled iOS Release app; preserve native diagnostics."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time


def run(*args, check=True):
    return subprocess.run(args, check=check, text=True, capture_output=True)


def main():
    evidence = Path('native-evidence').resolve()
    evidence.mkdir(exist_ok=True)
    devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json').stdout)['devices']
    candidates = [device for runtime, entries in devices.items() if 'iOS' in runtime for device in entries if 'iPhone' in device['name']]
    if not candidates:
        raise RuntimeError('No iPhone simulator runtime is installed')
    device = candidates[-1]
    udid = device['udid']
    run('xcrun', 'simctl', 'boot', udid, check=False)
    run('xcrun', 'simctl', 'bootstatus', udid, '-b')
    app = evidence / 'build/Build/Products/Release-iphonesimulator/BourbonSignal.app'
    if not app.exists():
        raise RuntimeError('Compiled Release app is absent')
    run('xcrun', 'simctl', 'install', udid, str(app))
    launched = run('xcrun', 'simctl', 'launch', '--terminate-running-process', '--stdout=' + str(evidence / 'stdout.log'), '--stderr=' + str(evidence / 'stderr.log'), udid, 'com.bourbonsignal.app', check=False)
    (evidence / 'launch.log').write_text(launched.stdout + launched.stderr)
    pid_match = re.search(r':\s*(\d+)\s*$', launched.stdout)
    pid = pid_match.group(1) if pid_match else None
    alive = False
    try:
        time.sleep(25)
        alive = bool(pid and run('ps', '-p', pid, '-o', 'comm=', check=False).returncode == 0)
        log = run('xcrun', 'simctl', 'spawn', udid, 'log', 'show', '--last', '2m', '--style', 'compact', '--predicate', 'process == "BourbonSignal"', check=False)
        (evidence / 'native.log').write_text(log.stdout + log.stderr)
        run('xcrun', 'simctl', 'io', udid, 'screenshot', str(evidence / 'startup.png'), check=False)
        for report in (Path.home() / 'Library/Logs/DiagnosticReports').glob('BourbonSignal*.ips'):
            shutil.copy2(report, evidence / report.name)
        (evidence / 'result.json').write_text(json.dumps({'device': device['name'], 'udid': udid, 'pid': pid, 'aliveAfter25Seconds': alive, 'launchExitCode': launched.returncode}, indent=2))
    finally:
        run('xcrun', 'simctl', 'shutdown', udid, check=False)
    if not alive:
        raise RuntimeError('Native cold startup failed; inspect native-evidence logs')
    print('Native process survived cold startup; screenshot still requires UI inspection.')


if __name__ == '__main__':
    main()
