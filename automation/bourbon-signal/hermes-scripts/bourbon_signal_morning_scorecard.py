import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo


def build_scorecard_command(env: dict[str, str]) -> list[str]:
    if not env.get("COMPANY_SCORECARD_READ_SECRET"):
        raise RuntimeError("The local scorecard read secret is missing or empty; synchronize it with the production secret before the morning run.")
    repo = resolve_repo(env)
    script = repo / "automation" / "bourbon-signal" / "fetch-company-scorecard.mjs"
    return ["node", "--env-file-if-exists=.env.local", "--no-warnings", "--experimental-strip-types", str(script), "--apply"]


def main() -> int:
    env = load_env()
    try:
        repo = resolve_repo(env)
        command = build_scorecard_command(env)
    except RuntimeError as error:
        print(f"Morning scorecard aggregation failed: {error}")
        return 1
    result = subprocess.run(
        command,
        cwd=str(repo), env=env, capture_output=True, text=True, timeout=180, check=False,
    )
    if result.returncode != 0:
        print(f"Morning scorecard aggregation failed: {failure_summary(result.stderr, result.stdout)[:400]}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
