"""Persistent offline recognizer: PCM in stdin, incremental results in stdout."""
import sys, json, base64, array
from pathlib import Path
config = json.loads(sys.stdin.readline())
sys.path.insert(0, config['runtime'])
from moonshine_voice import Transcriber, ModelArch
from moonshine_voice.transcriber import Error

def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)

lines, failures = {}, []
def listener(event):
    if isinstance(event, Error): failures.append(str(event.error))
    else: lines[event.line.line_id] = event.line.text.replace('\r', '').replace('\n', '')

try:
    with Transcriber(Path(config['model']), ModelArch.SMALL_STREAMING, update_interval=0.2,
                     options={'max_tokens_per_second': 13.0}) as transcriber:
        transcriber.add_listener(listener)
        transcriber.start()
        emit({'ready': True})
        audio_seconds = 0.0
        for raw in sys.stdin:
            request = json.loads(raw)
            if request['kind'] == 'audio':
                pcm = array.array('f')
                pcm.frombytes(base64.b64decode(request['pcm'], validate=True))
                if sys.byteorder != 'little': pcm.byteswap()
                if len(pcm) > 16000: raise ValueError('PCM chunk exceeds one second')
                audio_seconds += len(pcm) / 16000
                if audio_seconds > 301: raise ValueError('Recording exceeds five minutes')
                transcriber.add_audio(pcm, 16000)
            elif request['kind'] == 'stop': transcriber.stop()
            else: raise ValueError('Unknown stream command')
            if failures: raise RuntimeError('; '.join(failures))
            emit({'id': request['id'], 'text': ''.join(lines.values()), 'audioSeconds': audio_seconds})
            if request['kind'] == 'stop': break
except Exception as error:
    emit({'error': str(error)})
    sys.exit(1)
