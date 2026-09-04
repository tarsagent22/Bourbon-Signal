#!/bin/bash
# Deliberately non-dispatching: old automation must not gain release authority.
printf '%s\n' 'Retired: legacy deploy helper cannot build, stage, push, deploy or assign domains. Use the owner-authorized canonical release lane with reviewed-SHA admission.' >&2
exit 1
