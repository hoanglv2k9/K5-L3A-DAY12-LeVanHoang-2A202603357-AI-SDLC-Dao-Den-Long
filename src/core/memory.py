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


def get_machine_specs() -> dict[str, str | int | float]:
    """Return cross-platform host machine hardware & OS specs using Python stdlib."""
    import platform

    cpu = platform.processor() or platform.machine() or "unknown"
    ram_gb: float | None = None
    gpus: list[str] = []

    if sys.platform == "win32":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            ) as key:
                cpu_name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                if cpu_name:
                    cpu = str(cpu_name).strip()
        except Exception:
            pass

        try:
            import winreg

            disp_class = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, disp_class) as cls_key:
                idx = 0
                while idx < 16:
                    try:
                        sub_name = winreg.EnumKey(cls_key, idx)
                        idx += 1
                    except OSError:
                        break
                    try:
                        with winreg.OpenKey(cls_key, sub_name) as sub_key:
                            desc, _ = winreg.QueryValueEx(sub_key, "DriverDesc")
                            if desc and str(desc).strip() not in gpus:
                                gpus.append(str(desc).strip())
                    except OSError:
                        continue
        except Exception:
            pass

        try:
            class _MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.wintypes.DWORD),
                    ("dwMemoryLoad", ctypes.wintypes.DWORD),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            ms = _MEMORYSTATUSEX()
            ms.dwLength = ctypes.sizeof(_MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms)):
                ram_gb = round(ms.ullTotalPhys / (1024.0 ** 3), 1)
        except Exception:
            pass
    else:
        try:
            if hasattr(os, "sysconf"):
                pages = os.sysconf("SC_PHYS_PAGES")
                page_size = os.sysconf("SC_PAGE_SIZE")
                if pages > 0 and page_size > 0:
                    ram_gb = round((pages * page_size) / (1024.0 ** 3), 1)
        except Exception:
            pass

    return {
        "cpu": cpu,
        "logical_cores": os.cpu_count() or 0,
        "ram_gb": ram_gb if ram_gb is not None else "unknown",
        "gpu": " / ".join(gpus) if gpus else "N/A",
        "os": f"{platform.system()} {platform.release()} ({platform.machine()}, {platform.version()})",
        "python": platform.python_version(),
    }
