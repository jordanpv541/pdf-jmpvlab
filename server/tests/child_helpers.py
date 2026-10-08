"""Procesos hijos falsos para las pruebas (simulan un PDF que cuelga o que tumba el proceso).

Viven en un módulo aparte porque el proceso hijo los tiene que poder importar.
"""

import os
import signal
import time


def hang(task, args, conn, *rest):
    time.sleep(120)


def crash(task, args, conn, *rest):
    os.kill(os.getpid(), signal.SIGKILL)
