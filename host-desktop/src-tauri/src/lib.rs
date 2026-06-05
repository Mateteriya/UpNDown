use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

struct ServerChild(Mutex<Option<Child>>);

fn repo_root_dev() -> PathBuf {
    if let Ok(p) = std::env::var("UPDOWN_REPO_ROOT") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

fn resolve_bundle_root(handle: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(res) = handle.path().resource_dir() {
        let packaged = res.join("bundle");
        if packaged.join("server.cjs").is_file() {
            return packaged.canonicalize().ok();
        }
    }
    let dev = repo_root_dev().join("host-desktop").join("bundle");
    if dev.join("server.cjs").is_file() {
        return dev.canonicalize().ok();
    }
    None
}

fn spawn_bundled_server(bundle: &Path, port: u16) -> Result<Child, String> {
    let node = bundle.join("node").join("node.exe");
    let server = bundle.join("server.cjs");
    let game_dist = bundle.join("dist-host");
    let host_public = bundle.join("public");
    if !node.is_file() {
        return Err(format!("Не найден {}", node.display()));
    }
    if !server.is_file() {
        return Err(format!("Не найден {}", server.display()));
    }
    Command::new(&node)
        .arg(&server)
        .current_dir(bundle)
        .env("GAME_DIST", &game_dist)
        .env("UPDOWN_HOST_PUBLIC", &host_public)
        .env("PORT", port.to_string())
        .env("HOST", "0.0.0.0")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Не удалось запустить сервер: {e}"))
}

fn spawn_dev_npm_server() -> Result<Child, String> {
    let root = repo_root_dev();
    let dist_host = root.join("dist-host");
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "npm run server:start --prefix server"])
        .current_dir(&root)
        .env("GAME_DIST", dist_host)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().map_err(|e| {
        format!(
            "Режим разработки: нужен Node.js и npm install. {e}"
        )
    })
}

fn spawn_game_server(handle: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    if let Some(bundle) = resolve_bundle_root(handle) {
        return spawn_bundled_server(&bundle, port);
    }
    spawn_dev_npm_server()
}

fn wait_server_ready(port: u16) -> bool {
    for _ in 0..50 {
        if ping_version(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    false
}

fn ping_version(port: u16) -> bool {
    let mut stream = TcpStream::connect(format!("127.0.0.1:{port}")).ok()?;
    let req = format!(
        "GET /api/version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).ok()?;
    let body = String::from_utf8_lossy(&buf[..n]);
    body.contains("\"hostPanel\":true") || body.contains("host-panel-2026")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerChild(Mutex::new(None)))
        .setup(|app| {
            let port: u16 = std::env::var("PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3001);

            match spawn_game_server(app.handle(), port) {
                Ok(child) => {
                    *app.state::<ServerChild>().0.lock().unwrap() = Some(child);
                }
                Err(msg) => {
                    eprintln!("{msg}");
                }
            }

            if !wait_server_ready(port) {
                eprintln!(
                    "Сервер не ответил на порту {port}. Закройте другие копии «Игра в сети» и попробуйте снова."
                );
            }

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(&format!(
                    "window.location.replace('http://127.0.0.1:{port}/host');"
                ));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<ServerChild>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("ошибка запуска приложения");
}
