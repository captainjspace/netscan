#!/usr/bin/env zsh
############################################################
## Post network apocolypse scan
############################################################
#
setopt pipe_fail err_exit no_unset xtrace;
sudo route get default;
#trigger password
typeset -ia l;
l=( 30 20 20 20 10 );

#
TDD="$(mktemp -d -t tracer)"
time=$(date +'%s');
S="$(mktemp ${TDD}/TCPDUMP-wl.XXXXX)"
T="$(mktemp ${TDD}/TCPDUMP-wlocal.XXXXX)"   
U="$(mktemp ${TDD}/TCPDUMP-flgs.XXXXX)"
D="$(mktemp ${TDD}/TCPDUMP-vlan.XXXXX)"
M="$(mktemp ${TDD}/TCPDUMP-mdns.XXXXX)"
pids=(); 

declare -gxA files;
set_pid(){
  local $pid="$1";
  local $file="$2";
  pids+=( $pid );
  files[$pid]="$file";
  echo "\n $pid\t$file\n"

}

setopt monitor;

gtimeout "${l[1]}s" tcpdump -n host 224.0.0.251 and port 5353 > $M &
set_pid "$!" "$M";

gtimeout  "${l[2]}s" tcpdump -i en0 -w capture.pcap > $S &
set_pid "$!" "$S";

gtimeout  "${l[3]}s" tcpdump -i en15 ip and net localnet  > $T  & 
set_pid "$!" "$T";

gtimeout  "${l[4]}s" tcpdump -i en16 'tcp[tcpflags] & (tcp-syn|tcp-fin) != 0 and src and dst net localnet' > $U &
set_pid "$!" "$U";

gtimeout  "${l[5]}s" tcpdump -i en15 -nn -e vlan 10 -w "$P" &
set_pid "$!" "$P";


# Wait for each PID individually
t=();
for pid in "${pids[@]}"; do
    wait "$pid";
    echo "Process $pid finished";
    local $f="$files[$pid]";
    local $t="~/tmp/${f:t}.gz";
    gzip < "$f" > "$t"
    rm "$f";
    t+=( "$t" ); 
done;
end=$(strftime %s)
tar -cvf ~/tmp/tcpdump-tracer.tar "${t[*]}"
echo "TIME: $(( end-time ))"
cat <EOF

TMP = $TDD
FILES: 
$S
$T
$U
$M
$P


