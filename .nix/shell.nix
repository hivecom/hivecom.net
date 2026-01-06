{ pkgs ? import <nixpkgs> { } }:

let
  # Read `.node-version` (e.g. "24.11.1") and map it to the closest nixpkgs Node line (e.g. nodejs_24).
  #
  # Note: nixpkgs typically exposes Node by major line (`nodejs_18`, `nodejs_20`, `nodejs_22`, `nodejs_24`),
  # not exact patch versions. This shell will *sync major* with `.node-version`.
  nodeVersionFile = builtins.readFile ../.node-version;
  nodeVersion = pkgs.lib.strings.removeSuffix "\n" nodeVersionFile;

  # Extract major from "MAJOR.MINOR.PATCH" (or "MAJOR").
  majorStr =
    let
      m = builtins.match "^([0-9]+)(\\..*)?$" nodeVersion;
    in
      if m == null then
        throw "Invalid .node-version '${nodeVersion}'. Expected e.g. '20.11.1' or '20'."
      else
        builtins.elemAt m 0;

  nodeAttrName = "nodejs_${majorStr}";

  node =
    if builtins.hasAttr nodeAttrName pkgs then
      builtins.getAttr nodeAttrName pkgs
    else
      throw ''
        nixpkgs does not provide ${nodeAttrName}.

        Your .node-version is '${nodeVersion}' (major ${majorStr}).
        Available node packages in your nixpkgs may include: nodejs_18, nodejs_20, nodejs_22, nodejs_24.

        Fix options:
        - Change .node-version to a supported major (recommended), or
        - Update/pin nixpkgs to a revision that contains ${nodeAttrName}.
      '';
in
pkgs.mkShell {
  name = "hivecom-dev";

  # Tools commonly needed for Node-based workflows.
  packages = with pkgs; [
    node
    git
  ];

  # Helpful message (kept minimal; no automatic network calls).
  shellHook = ''
    echo "Loaded Nix dev shell with Node from nixpkgs: ${nodeAttrName}"
    echo "Requested by .node-version: ${nodeVersion}"
  '';
}
