"""Giọng nói: điện thoại ghi âm khi trình duyệt không tự nhận giọng được, PC đổi tiếng nói ra chữ bằng faster-whisper.

Lần đầu dùng, PC tự cài faster-whisper (pip) và tải mô hình (`small` khoảng 0,5 GB) về bộ nhớ đệm của Hugging Face.
Chạy trên CPU (int8) cho chắc; có CUDA 12 đủ thư viện thì chạy GPU. Đổi mô hình: registry.yaml `voice: {model: medium}`.
"""
import subprocess
import sys
import threading
import time

NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
_V = {'model': None, 'name': None, 'installing': False, 'note': None, 'lock': threading.Lock()}


def _install():
    _V['note'] = 'đang cài faster-whisper'
    r = subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', '-q', 'faster-whisper'],
                       capture_output=True, text=True, timeout=1800, creationflags=NOWIN)
    _V['note'] = None if r.returncode == 0 else 'cài faster-whisper lỗi: ' + (r.stderr or '')[-300:]
    _V['installing'] = False


def ready():
    """None when it can transcribe now, else why not (the install starts in the background the first time)."""
    try:
        import faster_whisper  # noqa: F401
        return None
    except ImportError:
        pass
    if not _V['installing'] and not (_V['note'] or '').startswith('cài faster-whisper lỗi'):
        _V['installing'] = True
        threading.Thread(target=_install, daemon=True).start()
    return _V['note'] or 'đang cài faster-whisper'


def _model(name):
    from faster_whisper import WhisperModel
    if _V['model'] is not None and _V['name'] == name:
        return _V['model']
    try:
        m = WhisperModel(name, device='cuda', compute_type='float16')
    except Exception:
        m = WhisperModel(name, device='cpu', compute_type='int8')
    _V.update(model=m, name=name)
    return m


def transcribe(path, name='small', language='vi'):
    """Text of an audio file (m4a, mp4, webm, wav…), and the seconds it took."""
    why = ready()
    if why:
        raise RuntimeError(why)
    t0 = time.time()
    with _V['lock']:
        segments, _ = _model(name).transcribe(str(path), language=language, beam_size=5, vad_filter=True)
        text = ' '.join(s.text.strip() for s in segments).strip()
    return text, round(time.time() - t0, 1)
