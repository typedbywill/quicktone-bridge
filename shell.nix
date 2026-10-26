{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShellNoCC {
  packages = with pkgs; [ ghidra jdk21 binutils procps file unzip alsa-lib ];

  GHIDRA_INSTALL_DIR = "${pkgs.ghidra}/lib/ghidra";
  JAVA_HOME = "${pkgs.jdk21}/lib/openjdk";

  shellHook = ''
    export PATH="$JAVA_HOME/bin:$PATH"
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.alsa-lib ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  '';
}
