//! provcheck — command-line C2PA Content Credentials verifier.
//!
//! Single-binary cross-platform verifier. Drag a file in, get the
//! manifest out. Designed to be wrappable in CI (stable exit codes +
//! --json output) AND usable by a human at a terminal (default human
//! rendering, readable in 80 columns).
//!
//! Exit codes:
//!
//! - `0` — file carries a valid C2PA manifest that verified.
//! - `1` — file is unsigned OR has an invalid manifest.
//! - `2` — I/O error, unreadable file, internal error.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;

/// Verify C2PA Content Credentials on a file.
#[derive(Debug, Parser)]
#[command(
    name = "provcheck",
    version,
    about = "Verify C2PA Content Credentials on a file.",
    long_about = None,
)]
struct Args {
    /// Path to the file to verify.
    file: PathBuf,

    /// Emit machine-readable JSON instead of the human-readable report.
    /// Handy for CI and scripting — schema matches `provcheck_core::Report`.
    #[arg(long)]
    json: bool,

    /// Silence all non-error output. Exit code is still set; use in
    /// shell pipelines where you only care about pass/fail.
    #[arg(long, short)]
    quiet: bool,
}

fn main() -> ExitCode {
    let args = Args::parse();

    let report = match provcheck_core::verify(&args.file) {
        Ok(r) => r,
        Err(e) => {
            if !args.quiet {
                eprintln!("provcheck: {}", e);
            }
            return ExitCode::from(2);
        }
    };

    if !args.quiet {
        if args.json {
            match provcheck_core::render::to_json_string(&report) {
                Ok(j) => println!("{}", j),
                Err(e) => {
                    eprintln!("provcheck: failed to serialize JSON: {}", e);
                    return ExitCode::from(2);
                }
            }
        } else {
            print!("{}", provcheck_core::render::to_human_string(&report));
        }
    }

    ExitCode::from(report.exit_code() as u8)
}
