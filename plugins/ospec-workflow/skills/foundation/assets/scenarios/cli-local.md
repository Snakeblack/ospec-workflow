# CLI local without a service

## Files

Read and write local files. Failures name the path and the reason.

## Errors

A missing file is an error the caller can handle. It is not a silent skip.

## Compatibility

Support the declared operating systems. A newer file format is rejected with an explicit error.

## Distribution

Ship one executable. The user installs it without a cluster.

## Tests

Run the suite on the local machine, offline.

Kubernetes is not a requirement.
cncf-landscape: not loaded.
