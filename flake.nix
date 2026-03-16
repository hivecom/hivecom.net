{
  description = "hivecom.net";
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.11";
  };
  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      supportedSystems = [ "x86_64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs supportedSystems;
      pkgsBySystem = forEachSystem (system: import nixpkgs { inherit system; });
    in
    {
      devShells = forEachSystem (system: {
        default = pkgsBySystem.${system}.callPackage ./.nix/shell.nix { };
      });
    };
}
