# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — builds enterprise/bridge/server.py into a self-contained binary.
# Output: enterprise/bridge/dist/server  (macOS/Linux)
#         enterprise/bridge/dist/server.exe  (Windows)
#
# Build:
#   cd enterprise/bridge
#   pip install pyinstaller fastapi "uvicorn[standard]"
#   pyinstaller --clean graperoot-server.spec

block_cipher = None

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.off",
        "uvicorn.lifespan.on",
        "fastapi",
        "pydantic",
        "pydantic.deprecated.class_validators",
        "pydantic.deprecated.config",
        "pydantic.deprecated.tools",
        "pydantic_core",
        "anyio",
        "anyio._backends._asyncio",
        "starlette.routing",
        "starlette.middleware.cors",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "PIL"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # keep console for bridge logging visible to Electron
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
