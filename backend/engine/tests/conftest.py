"""Property tests measure correctness, not speed: on a busy machine (the CI
runner, or the e2e stack running beside them) Hypothesis's timing checks
fail tests whose properties hold."""

from hypothesis import HealthCheck, settings

settings.register_profile("engine", deadline=None, suppress_health_check=[HealthCheck.too_slow])
settings.load_profile("engine")
