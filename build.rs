//! The web client is built before the program that carries it.

fn main() {
    println!("cargo:rerun-if-changed=frontend/dist");
    if !std::path::Path::new("frontend/dist/index.html").is_file() {
        panic!(
            "the frontend is not built: run `npm ci && npm run build` in frontend/ first \
             (scripts/build.sh does both, then builds the program)"
        );
    }
}
