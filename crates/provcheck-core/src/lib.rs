//! # provcheck-core
//!
//! Verify C2PA Content Credentials on any file format supported by
//! the upstream `c2pa` crate (audio, image, video).
//!
//! The library is intentionally thin — it wraps `c2pa::Reader` with a
//! stable [`Report`] type that both the CLI and the GUI render.
//! Behaviour is identical across front-ends because there is exactly
//! one code path through `verify`.
//!
//! ```no_run
//! use provcheck_core::verify;
//! use std::path::Path;
//!
//! let report = verify(Path::new("signed.wav"))?;
//! if report.verified {
//!     println!("Signed by {:?}", report.signer);
//! }
//! # Ok::<(), provcheck_core::Error>(())
//! ```

use std::path::Path;

use serde::{Deserialize, Serialize};

pub mod render;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("file not found or unreadable: {0}")]
    Io(#[from] std::io::Error),
    #[error("C2PA read failed: {0}")]
    C2pa(#[from] c2pa::Error),
}

/// The outcome of verifying a single file.
///
/// `verified` is the load-bearing field — everything else is
/// descriptive. Callers that only care about pass/fail should check
/// that one boolean; callers that display the manifest should walk
/// the richer fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    /// True iff the file carries a C2PA manifest that parses cleanly
    /// and whose signature validates.
    pub verified: bool,

    /// True iff the file has NO C2PA manifest at all (as distinct from
    /// a manifest that exists but fails verification).
    pub unsigned: bool,

    /// Human-readable reason when `verified` is false. `None` when
    /// everything's fine.
    pub failure_reason: Option<String>,

    /// Identifier of the active manifest (`c2pa.id`), if any.
    pub active_manifest: Option<String>,

    /// Signer (certificate subject common name) of the active
    /// manifest, if any.
    pub signer: Option<String>,

    /// ISO-8601 timestamp of signing, if recorded.
    pub signed_at: Option<String>,

    /// Tool that produced the manifest (`claim_generator`).
    pub claim_generator: Option<String>,

    /// Free-form claim summary — assertion label → JSON value. Exposes
    /// AI-model assertions, training-data attestations, creator info,
    /// edit actions, etc.
    pub assertions: serde_json::Value,

    /// Count of ingredient manifests (parent files this one was
    /// derived from). 0 for a root artefact; >0 for edits / remixes.
    pub ingredient_count: usize,

    /// MIME type / format as reported by `c2pa`.
    pub format: Option<String>,

    /// Number of validation status entries. Zero means no validation
    /// errors; >0 means the signature or manifest had integrity issues.
    pub validation_errors: usize,
}

impl Report {
    /// Exit code convention used by the CLI.
    ///
    /// `0` — signed and verified.
    /// `1` — unsigned OR invalid.
    /// The `2` exit-code for I/O errors is handled at the CLI layer,
    /// not by the report.
    pub fn exit_code(&self) -> i32 {
        if self.verified { 0 } else { 1 }
    }
}

/// Verify the C2PA credentials on the file at `path`.
///
/// Returns a populated [`Report`]. Does not panic on unsigned or
/// invalid input — those are reported via the `Report` fields.
///
/// Only returns `Err` on I/O failure (file missing, unreadable) or
/// an internal `c2pa` crate error that prevents any meaningful
/// verification attempt. Signature failures on a readable file are
/// reported as `verified: false` in the `Report`, not as an `Err`.
pub fn verify(path: &Path) -> Result<Report, Error> {
    // Guard: file must exist and be a file. `c2pa::Reader` would also
    // surface this, but a preflight check gives us a better error.
    let _ = std::fs::metadata(path)?;

    // TODO(milestone-1): swap placeholder logic for real `c2pa::Reader`
    //                    calls once fixture layout is settled.
    //
    // The current `c2pa` 0.78 API flow is roughly:
    //
    //     let reader = c2pa::Reader::from_file(path)?;
    //     let active = reader.active_manifest();
    //     let validation = reader.validation_status();
    //
    // and we project that into our stable `Report` shape. Keeping it
    // stubbed here during scaffold so the crate compiles + tests
    // establish the contract; the real wiring lands next.
    Ok(Report {
        verified: false,
        unsigned: true,
        failure_reason: Some("provcheck-core scaffold — verification not yet wired".into()),
        active_manifest: None,
        signer: None,
        signed_at: None,
        claim_generator: None,
        assertions: serde_json::Value::Null,
        ingredient_count: 0,
        format: None,
        validation_errors: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_is_io_error() {
        let err = verify(Path::new("does_not_exist_abcxyz.wav")).unwrap_err();
        assert!(matches!(err, Error::Io(_)));
    }

    #[test]
    fn exit_code_maps_verified_state() {
        let mut r = Report {
            verified: false,
            unsigned: true,
            failure_reason: None,
            active_manifest: None,
            signer: None,
            signed_at: None,
            claim_generator: None,
            assertions: serde_json::Value::Null,
            ingredient_count: 0,
            format: None,
            validation_errors: 0,
        };
        assert_eq!(r.exit_code(), 1);
        r.verified = true;
        assert_eq!(r.exit_code(), 0);
    }
}
