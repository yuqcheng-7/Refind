#!/usr/bin/env python3
"""Convert Office files to PDF.

Prefer Microsoft Office on macOS (much better PPT/Excel fidelity),
then fall back to LibreOffice.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ALLOWED_EXTENSIONS = {".pptx", ".ppt", ".xlsx", ".xls", ".docx", ".doc", ".odt", ".odp", ".ods"}
PPT_EXTENSIONS = {".pptx", ".ppt"}
XLS_EXTENSIONS = {".xlsx", ".xls"}
MAX_BYTES = 15 * 1024 * 1024

SOFFICE_CANDIDATES = [
  os.environ.get("LIBREOFFICE_PATH") or "",
  "soffice",
  "libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/usr/lib/libreoffice/program/soffice",
]


def resolve_soffice() -> str | None:
  for candidate in SOFFICE_CANDIDATES:
    value = str(candidate or "").strip()
    if not value:
      continue
    if os.path.sep in value or value.startswith("."):
      if Path(value).is_file() and os.access(value, os.X_OK):
        return value
      continue
    found = shutil.which(value)
    if found:
      return found
  return None


def _app_exists(app_name: str) -> bool:
  return Path(f"/Applications/{app_name}.app").is_dir()


def _run_osascript(script: str, timeout: int = 180) -> subprocess.CompletedProcess[str]:
  return subprocess.run(
    ["osascript", "-e", script],
    capture_output=True,
    text=True,
    timeout=timeout,
    check=False,
  )


def _convert_with_powerpoint(source: Path, pdf_path: Path) -> None:
  if not _app_exists("Microsoft PowerPoint"):
    raise RuntimeError("Microsoft PowerPoint not installed")
  src = str(source.resolve())
  dst = str(pdf_path.resolve())
  # PowerPoint AppleScript: save as PDF (native export, high fidelity).
  script = f'''
tell application "Microsoft PowerPoint"
  launch
  open POSIX file "{src}"
  set waitCount to 0
  repeat until (exists active presentation) or waitCount > 100
    delay 0.1
    set waitCount to waitCount + 1
  end repeat
  if not (exists active presentation) then error "PowerPoint failed to open file"
  save active presentation in (POSIX file "{dst}") as save as PDF
  close active presentation saving no
end tell
'''
  completed = _run_osascript(script)
  if completed.returncode != 0 or not pdf_path.is_file():
    detail = (completed.stderr or completed.stdout or "").strip()
    raise RuntimeError(detail or "PowerPoint PDF export failed")


def _convert_with_excel(source: Path, pdf_path: Path) -> None:
  if not _app_exists("Microsoft Excel"):
    raise RuntimeError("Microsoft Excel not installed")
  src = str(source.resolve())
  dst = str(pdf_path.resolve())
  script = f'''
tell application "Microsoft Excel"
  launch
  open workbook workbook file name "{src}"
  set waitCount to 0
  repeat until (exists active workbook) or waitCount > 100
    delay 0.1
    set waitCount to waitCount + 1
  end repeat
  if not (exists active workbook) then error "Excel failed to open file"
  save active workbook in "{dst}" as PDF file format
  close active workbook saving no
end tell
'''
  completed = _run_osascript(script)
  if completed.returncode != 0 or not pdf_path.is_file():
    detail = (completed.stderr or completed.stdout or "").strip()
    raise RuntimeError(detail or "Excel PDF export failed")


def _convert_filter_for(suffix: str) -> str:
  if suffix in PPT_EXTENSIONS:
    # Higher-quality Impress PDF export when falling back to LibreOffice.
    return "pdf:impress_pdf_Export"
  if suffix in XLS_EXTENSIONS:
    return "pdf:calc_pdf_Export"
  if suffix in {".docx", ".doc", ".odt"}:
    return "pdf:writer_pdf_Export"
  return "pdf"


def _convert_with_libreoffice(source: Path, out_dir: Path, suffix: str) -> Path:
  soffice = resolve_soffice()
  if not soffice:
    raise RuntimeError(
      "LibreOffice 未安装。请安装 LibreOffice 后重试"
      "（macOS: brew install --cask libreoffice）。"
    )
  convert_to = _convert_filter_for(suffix)
  cmd = [
    soffice,
    "--headless",
    "--nologo",
    "--nofirststartwizard",
    "--norestore",
    "--convert-to",
    convert_to,
    "--outdir",
    str(out_dir),
    str(source),
  ]
  completed = subprocess.run(
    cmd,
    capture_output=True,
    text=True,
    timeout=120,
    check=False,
  )
  pdf_path = source.with_suffix(".pdf")
  if not pdf_path.is_file():
    matches = list(out_dir.glob("*.pdf"))
    if not matches:
      detail = (completed.stderr or completed.stdout or "").strip()
      raise RuntimeError(detail or "LibreOffice conversion produced no PDF")
    pdf_path = matches[0]
  return pdf_path


def convert_office_to_pdf(filename: str, payload: bytes) -> bytes:
  if not payload:
    raise ValueError("empty file")
  if len(payload) > MAX_BYTES:
    raise ValueError("file exceeds 15MB limit")

  name = Path(str(filename or "document.bin")).name
  suffix = Path(name).suffix.lower()
  if suffix not in ALLOWED_EXTENSIONS:
    raise ValueError(f"unsupported extension: {suffix or '(none)'}")

  errors: list[str] = []
  with tempfile.TemporaryDirectory(prefix="refind-office-") as tmp:
    source = Path(tmp) / name
    source.write_bytes(payload)
    pdf_path = source.with_suffix(".pdf")

    # Prefer Microsoft Office for PPT/Excel fidelity on macOS.
    if suffix in PPT_EXTENSIONS:
      try:
        _convert_with_powerpoint(source, pdf_path)
        return pdf_path.read_bytes()
      except Exception as exc:  # noqa: BLE001
        errors.append(f"PowerPoint: {exc}")

    if suffix in XLS_EXTENSIONS:
      try:
        _convert_with_excel(source, pdf_path)
        return pdf_path.read_bytes()
      except Exception as exc:  # noqa: BLE001
        errors.append(f"Excel: {exc}")

    try:
      pdf_path = _convert_with_libreoffice(source, Path(tmp), suffix)
      return pdf_path.read_bytes()
    except Exception as exc:  # noqa: BLE001
      errors.append(f"LibreOffice: {exc}")
      raise RuntimeError("；".join(errors) or str(exc)) from exc
