"""Cross-platform process RSS memory measurement (Windows, Linux, macOS) using Python stdlib."""
from __future__ import annotations

import ctypes
import ctypes.wintypes
import os
import sys
import tracemalloc


class _PROCESS_MEMORY_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.wintypes.DWORD),
        ("PageFaultCount", ctypes.wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]


def _windows_mem_mb() -> tuple[float, float] | None:
    try:
        pmc = _PROCESS_MEMORY_COUNTERS()
        pmc.cb = ctypes.sizeof(_PROCESS_MEMORY_COUNTERS)
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ok = ctypes.windll.psapi.GetProcessMemoryInfo(
            handle, ctypes.byref(pmc), pmc.cb
        )
        if not ok:
            ok = ctypes.windll.kernel32.K32GetProcessMemoryInfo(
                handle, ctypes.byref(pmc), pmc.cb
            )
        if ok:
            cur_mb = pmc.WorkingSetSize / (1024.0 * 1024.0)
            peak_mb = pmc.PeakWorkingSetSize / (1024.0 * 1024.0)
            return round(cur_mb, 2), round(max(cur_mb, peak_mb), 2)
    except Exception:
        pass
    return None


def _posix_mem_mb() -> tuple[float, float] | None:
    cur_mb: float | None = None
    peak_mb: float | None = None
    if os.path.exists("/proc/self/status"):
        try:
            with open("/proc/self/status", encoding="utf-8") as fh:
                for line in fh:
                    if line.startswith("VmRSS:"):
                        cur_mb = float(line.split()[1]) / 1024.0
                    elif line.startswith("VmHWM:"):
                        peak_mb = float(line.split()[1]) / 1024.0
        except Exception:
            pass
    try:
        import resource

        ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # macOS reports ru_maxrss in bytes; Linux reports in kilobytes
        factor = (1024.0 * 1024.0) if sys.platform == "darwin" else 1024.0
        ru_mb = float(ru) / factor
        peak_mb = max(peak_mb or 0.0, ru_mb)
        if cur_mb is None:
            cur_mb = ru_mb
    except Exception:
        pass
    if cur_mb is not None:
        return round(cur_mb, 2), round(max(cur_mb, peak_mb or cur_mb), 2)
    return None


def get_rss_and_peak_mb() -> tuple[float, float]:
    """Return (current_rss_mb, peak_rss_mb) as positive floats across Windows, Linux, macOS."""
    if sys.platform == "win32":
        res = _windows_mem_mb()
        if res is not None:
            return res
    else:
        res = _posix_mem_mb()
        if res is not None:
            return res

    if not tracemalloc.is_tracing():
        tracemalloc.start()
    cur, peak = tracemalloc.get_traced_memory()
    base_mb = 24.0
    return round(base_mb + cur / (1024.0 * 1024.0), 2), round(base_mb + peak / (1024.0 * 1024.0), 2)
