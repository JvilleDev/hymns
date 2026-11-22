// ONNX Runtime (binarios precompilados de `ort`) usa `___isPlatformVersionAtLeast`, que vive en la
// runtime de clang. En release rustc no la enlaza sola, así que se añade explícitamente en macOS.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(out) = std::process::Command::new("clang")
            .arg("--print-file-name=libclang_rt.osx.a")
            .output()
        {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if std::path::Path::new(&path).is_file() {
                println!("cargo:rustc-link-arg={path}");
            }
        }
    }
    println!("cargo:rerun-if-changed=build.rs");
}
