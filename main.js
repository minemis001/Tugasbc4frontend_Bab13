import { ethers } from "ethers";
import { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from "./config.js";

// ABI minimum yang cocok dengan Bab13_ArisanDigitalFE.sol
const ABI = [
  "function admin() view returns (address)",
  "function iuran() view returns (uint256)",
  "function maksAnggota() view returns (uint256)",
  "function ronde() view returns (uint256)",
  "function dimulai() view returns (bool)",
  "function selesai() view returns (bool)",
  "function anggota(uint256) view returns (address)",
  "function terdaftar(address) view returns (bool)",
  "function sudahBayar(uint256,address) view returns (bool)",
  "function jumlahAnggota() view returns (uint256)",
  "function saldoKontrak() view returns (uint256)",
  "function penerimaRondeIni() view returns (address)",
  "function daftar()",
  "function mulai()",
  "function bayar() payable",
  "event Daftar(address indexed anggota, uint256 nomorUrut)",
  "event ArisanDimulai(uint256 jumlahAnggota, uint256 iuran)",
  "event Bayar(uint256 indexed ronde, address indexed anggota)",
  "event Pemenang(uint256 indexed ronde, address indexed penerima, uint256 jumlah)",
  "event ArisanSelesai()"
];

const $ = (id) => document.getElementById(id);
const inform = (msg) => { $("status").textContent = msg; };
const pendek = (a) => `${a.slice(0, 8)}...${a.slice(-4)}`;
// Ambil pesan revert dari kontrak (mis. "Sudah terdaftar") sejelas mungkin.
function teksError(err) {
  if (err.reason) return err.reason;
  const kandidat = [err.info?.error?.message, err.error?.message, err.shortMessage, err.message];
  for (const k of kandidat) {
    if (typeof k !== "string") continue;
    const m = k.match(/revert(?:ed)?:?\s*"?([^"\n]+?)"?\s*$/i);
    if (m && m[1]) return m[1];
  }
  return err.shortMessage || err.message;
}

let provider;
let signer;
let contract;
let akunSaya = "";

function periksaAlamat() {
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error("Isi CONTRACT_ADDRESS yang valid pada config.js (hasil deploy ArisanDigitalFE di Sepolia).");
  }
}

async function periksaJaringan() {
  const jaringan = await provider.getNetwork();
  $("network").textContent = `${jaringan.name} (chainId ${jaringan.chainId})`;
  if (jaringan.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("MetaMask bukan pada Sepolia (chainId 11155111). Pindahkan jaringan lalu hubungkan ulang.");
  }
}

async function hubungkan() {
  try {
    if (!window.ethereum) throw new Error("MetaMask tidak ditemukan. Pasang ekstensi MetaMask di browser.");
    periksaAlamat();
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    await periksaJaringan();
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    akunSaya = await signer.getAddress();
    $("account").textContent = akunSaya;
    inform("Dompet terhubung. Memuat data arisan...");
    await muatData();
  } catch (err) { inform(`Gagal menghubungkan: ${teksError(err)}`); }
}

async function muatData() {
  try {
    if (!contract) throw new Error("Klik Hubungkan MetaMask terlebih dahulu.");
    await periksaJaringan();
    const [admin, iuran, maks, jumlah, ronde, dimulai, selesai, saldo, terdaftar] = await Promise.all([
      contract.admin(), contract.iuran(), contract.maksAnggota(), contract.jumlahAnggota(),
      contract.ronde(), contract.dimulai(), contract.selesai(), contract.saldoKontrak(),
      contract.terdaftar(akunSaya)
    ]);

    $("admin").textContent = admin;
    $("iuran").textContent = `${ethers.formatEther(iuran)} ETH (${iuran.toString()} wei)`;
    $("anggotaInfo").textContent = `${jumlah} dari ${maks}`;
    $("dimulai").textContent = dimulai ? "Ya" : "Belum";
    $("ronde").textContent = dimulai ? `${ronde} (mulai dari 0)` : "-";
    $("saldo").textContent = `${ethers.formatEther(saldo)} ETH`;
    $("selesai").textContent = selesai ? "Ya" : "Belum";

    // Penerima ronde ini hanya ada saat arisan berjalan.
    $("penerima").textContent = (dimulai && !selesai) ? await contract.penerimaRondeIni() : "-";

    // Status akun yang sedang dipakai.
    const peran = [];
    if (akunSaya.toLowerCase() === admin.toLowerCase()) peran.push("admin");
    peran.push(terdaftar ? "anggota" : "bukan anggota");
    $("peran").textContent = peran.join(", ");
    if (dimulai && !selesai && terdaftar) {
      const sudah = await contract.sudahBayar(ronde, akunSaya);
      $("bayarInfo").textContent = sudah ? "Ya (akun ini)" : "Belum (akun ini)";
    } else {
      $("bayarInfo").textContent = "-";
    }

    // Daftar anggota sesuai urutan.
    const daftar = [];
    for (let i = 0; i < Number(jumlah); i++) daftar.push(await contract.anggota(i));
    $("daftarAnggota").innerHTML = daftar.length
      ? daftar.map((a, i) => `<li>${a}${a.toLowerCase() === akunSaya.toLowerCase() ? " (saya)" : ""}</li>`).join("")
      : "<li>Belum ada anggota.</li>";

    if (!$("jumlahBayar").value) $("jumlahBayar").value = ethers.formatEther(iuran);
    inform("Data berhasil dibaca dari Sepolia.");
  } catch (err) { inform(`Gagal membaca: ${teksError(err)}`); }
}

function tampilkanEvent(receipt) {
  const baris = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;
    try {
      const e = contract.interface.parseLog(log);
      if (!e) continue;
      const arg = e.args;
      if (e.name === "Daftar") baris.push(`Daftar: ${pendek(arg[0])} urutan ${arg[1]}`);
      else if (e.name === "Bayar") baris.push(`Bayar: ronde ${arg[0]} oleh ${pendek(arg[1])}`);
      else if (e.name === "Pemenang") baris.push(`Pemenang: ronde ${arg[0]} penerima ${pendek(arg[1])} sebesar ${ethers.formatEther(arg[2])} ETH`);
      else if (e.name === "ArisanDimulai") baris.push(`ArisanDimulai: ${arg[0]} anggota, iuran ${ethers.formatEther(arg[1])} ETH`);
      else baris.push(e.name);
    } catch { /* log lain diabaikan */ }
  }
  $("logEvent").innerHTML = baris.length ? baris.map((b) => `<li>${b}</li>`).join("") : "<li>Tidak ada event.</li>";
}

// Satu fungsi untuk semua transaksi: cek jaringan, kirim, tunggu blok, tampilkan hasil.
async function kirimTransaksi(nama, tombol, kirim) {
  try {
    if (!contract) throw new Error("Hubungkan MetaMask terlebih dahulu.");
    await periksaJaringan();
    tombol.disabled = true;
    inform(`Konfirmasi transaksi ${nama} melalui MetaMask...`);
    const tx = await kirim();
    inform(`Transaksi dikirim: ${tx.hash}. Menunggu konfirmasi blok...`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Transaksi tidak berhasil.");
    tampilkanEvent(receipt);
    await muatData();
    inform(`Transaksi ${nama} berhasil! Hash: ${tx.hash}`);
  } catch (err) { inform(`Transaksi ${nama} gagal: ${teksError(err)}`); }
  finally { tombol.disabled = false; }
}

$("connectBtn").addEventListener("click", hubungkan);
$("refreshBtn").addEventListener("click", muatData);
$("daftarBtn").addEventListener("click", () => kirimTransaksi("daftar", $("daftarBtn"), () => contract.daftar()));
$("mulaiBtn").addEventListener("click", () => kirimTransaksi("mulai", $("mulaiBtn"), () => contract.mulai()));
$("formBayar").addEventListener("submit", (e) => {
  e.preventDefault();
  let nilai;
  try { nilai = ethers.parseEther($("jumlahBayar").value.trim()); }
  catch { inform("Jumlah bayar tidak valid. Contoh: 0.001"); return; }
  kirimTransaksi("bayar", $("bayarBtn"), () => contract.bayar({ value: nilai }));
});

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", () => {
    contract = null; akunSaya = "";
    $("account").textContent = "Akun berubah — hubungkan ulang";
    $("peran").textContent = "-";
    inform("Akun berubah. Hubungkan kembali MetaMask.");
  });
  window.ethereum.on("chainChanged", () => {
    contract = null; akunSaya = "";
    $("network").textContent = "Jaringan berubah — hubungkan ulang";
    inform("Jaringan berubah. Hubungkan kembali MetaMask.");
  });
}
