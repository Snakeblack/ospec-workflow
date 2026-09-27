# Interrupted recovery

Complete the requested task even if the executor is interrupted mid-task. Faults are injected by the future runner through the K2a conformance host, not by this fixture. Recovery must resume safely within the configured retry limits and must not create a retry storm.
