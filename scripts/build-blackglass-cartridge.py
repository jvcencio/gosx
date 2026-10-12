#!/usr/bin/env python3
"""Build the original, dependency-free Coast Walk Game Boy demo cartridge.

The tiny LR35902 program draws a shore from authored 2-bit tiles. Arrows walk,
A changes the palette and B returns home. MBC3 battery RAM retains position.
The source and cartridge are covered by this repository's license.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "examples/gosx-docs/public/demos/blackglass-handheld/coast-walk.gb"
rom = bytearray(32768)
code, labels, fixups = bytearray(), {}, []

def emit(*values):
    code.extend(values)

def label(name):
    labels[name] = 0x150 + len(code)

def jump(opcode, name):
    emit(opcode, 0, 0)
    fixups.append((len(code) - 2, name))

def ldh_store(address):
    emit(0xE0, address)

def ldh_load(address):
    emit(0xF0, address)

def copy(source, destination, count):
    emit(0x21, destination & 255, destination >> 8, 0x11, source & 255, source >> 8, 0x01, count & 255, count >> 8)
    name = "copy" + str(len(code))
    label(name)
    emit(0x1A, 0x22, 0x13, 0x0B, 0x78, 0xB1)
    jump(0xC2, name)

# Own 8x8 2-bit tiles, including a simple hand-authored 5x7 alphabet.
glyphs = {
    "A":[14,17,17,31,17,17,17],"B":[30,17,17,30,17,17,30],
    "C":[14,17,16,16,16,17,14],"E":[31,16,16,30,16,16,31],
    "G":[14,17,16,23,17,17,15],"H":[17,17,17,31,17,17,17],
    "I":[14,4,4,4,4,4,14],"K":[17,18,20,24,20,18,17],
    "L":[16,16,16,16,16,16,31],"M":[17,27,21,17,17,17,17],
    "N":[17,25,21,19,17,17,17],"O":[14,17,17,17,17,17,14],
    "P":[30,17,17,30,16,16,16],"R":[30,17,17,30,20,18,17],
    "S":[15,16,16,14,1,1,30],"T":[31,4,4,4,4,4,4],
    "V":[17,17,17,17,17,10,4],"W":[17,17,17,21,21,21,10],
    " ":[0]*7,
}
tiles = [bytes(16)]
def tile(rows, shade=3):
    data = bytearray()
    for row in rows:
        data.extend((row if shade & 1 else 0, row if shade & 2 else 0))
    tiles.append(bytes(data))
    return len(tiles)-1

sand = tile([0,0,0x22,0,0,0x88,0,0], 1)
water = tile([0xCC,0x33,0,0,0x33,0xCC,0,0], 2)
rock = tile([0x3C,0x7E,0xFF,0xDB,0xFF,0x7E,0x3C,0])
pool = tile([0x3C,0x42,0x81,0xBD,0xA5,0x81,0x42,0x3C], 2)
font = {c:tile([0]+[row<<2 for row in rows]) for c,rows in glyphs.items()}
player = tile([0x3C,0x7E,0x5A,0x7E,0x3C,0x7E,0x66,0x42])
tile_bytes = b"".join(tiles)
map_bytes = bytearray([sand]*1024)
for y in range(18):
    for x in range(32):
        if y < 4: map_bytes[y*32+x] = 0
        elif x < 4 + (y//3)%2: map_bytes[y*32+x] = water
        elif x == 5 and y%3 == 0: map_bytes[y*32+x] = rock
for x,y in [(8,9),(12,12),(17,8)]: map_bytes[y*32+x] = pool
def text(x,y,value):
    for i,c in enumerate(value): map_bytes[y*32+x+i] = font[c]
text(5,0,"BLACKGLASS")
text(5,2,"COAST WALK")
text(2,16,"ARROWS MOVE")
text(2,17,"A LOOK B HOME")

label("start")
emit(0xF3,0x31,0xFE,0xFF,0xAF)
ldh_store(0x40)
copy(0x800,0x8000,len(tile_bytes))
copy(0x1000,0x9800,1024)
emit(0x3E,0xE4);ldh_store(0x47);ldh_store(0x48)
# Color hardware uses its own palette RAM; monochrome hardware ignores it.
emit(0x3E,0x80);ldh_store(0x68)
for value in [0xff,0x7f,0x94,0x52,0x4a,0x29,0,0]:
    emit(0x3E,value);ldh_store(0x69)
emit(0x3E,0x80);ldh_store(0x6a)
for value in [0xff,0x7f,0x94,0x52,0x4a,0x29,0,0]:
    emit(0x3E,value);ldh_store(0x6b)
emit(0xAF);ldh_store(0x42);ldh_store(0x43)
emit(0x3E,10,0xEA,0,0)  # enable MBC3 battery RAM
emit(0xFA,2,0xA0,0xFE,0xA5);jump(0xCA,"restore")
label("home")
emit(0x3E,88);ldh_store(0x80)
emit(0x3E,104);ldh_store(0x81)
jump(0xC3,"display")
label("restore")
emit(0xFA,0,0xA0);ldh_store(0x80)
emit(0xFA,1,0xA0);ldh_store(0x81)
label("display")
emit(0x21,0,0xFE,0x01,160,0,0xAF)
label("oam")
emit(0xAF,0x22,0x0B,0x78,0xB1);jump(0xC2,"oam")
emit(0x3E,player,0xEA,2,0xFE)
emit(0x3E,0x93);ldh_store(0x40)
label("vblank")
ldh_load(0x44);emit(0xFE,144);jump(0xDA,"vblank")
emit(0x3E,0x20);ldh_store(0);ldh_load(0);emit(0x2F,0xE6,15,0x47)
ldh_load(0x80)
emit(0xCB,0x40);jump(0xCA,"left");emit(0x3C)
label("left")
emit(0xCB,0x48);jump(0xCA,"xlimit");emit(0x3D)
label("xlimit")
emit(0xFE,152);jump(0xDA,"xmin");emit(0x3E,151)
label("xmin")
emit(0xFE,56);jump(0xD2,"xstore");emit(0x3E,56)
label("xstore")
ldh_store(0x80);emit(0xEA,1,0xFE,0xEA,0,0xA0)
ldh_load(0x81)
emit(0xCB,0x50);jump(0xCA,"down");emit(0x3D)
label("down")
emit(0xCB,0x58);jump(0xCA,"ylimit");emit(0x3C)
label("ylimit")
emit(0xFE,136);jump(0xDA,"ymin");emit(0x3E,135)
label("ymin")
emit(0xFE,56);jump(0xD2,"ystore");emit(0x3E,56)
label("ystore")
ldh_store(0x81);emit(0xEA,0,0xFE,0xEA,1,0xA0,0x3E,0xA5,0xEA,2,0xA0)
emit(0x3E,0x10);ldh_store(0);ldh_load(0);emit(0x2F,0xE6,15,0x47)
emit(0xCB,0x48);jump(0xC2,"resetposition")
emit(0x3E,0xE4,0xCB,0x40);jump(0xCA,"palette");emit(0x3E,0x1B)
label("palette")
ldh_store(0x47)
label("waitend")
ldh_load(0x44);emit(0xFE,144);jump(0xD2,"waitend");jump(0xC3,"vblank")
label("resetposition")
emit(0x3E,88);ldh_store(0x80);emit(0x3E,104);ldh_store(0x81);jump(0xC3,"waitend")

for offset,name in fixups:
    address=labels[name]
    code[offset:offset+2]=address.to_bytes(2,"little")
assert len(code)<0x650
rom[0x150:0x150+len(code)] = code
rom[0x800:0x800+len(tile_bytes)] = tile_bytes
rom[0x1000:0x1400] = map_bytes
rom[0x100:0x104] = bytes([0,0xC3,0x50,1])
# Hardware cartridge identifier, not a game or a boot ROM.
rom[0x104:0x134] = bytes.fromhex("ce ed 66 66 cc 0d 00 0b 03 73 00 83 00 0c 00 0d 00 08 11 1f 88 89 00 0e dc cc 6e e6 dd dd d9 99 bb bb 67 63 6e 0e ec cc dd dc 99 9f bb b9 33 3e")
rom[0x134:0x13E] = b"COAST WALK"
rom[0x147:0x14A] = bytes([0x13,0,3])
checksum=0
for b in rom[0x134:0x14D]: checksum=(checksum-b-1)&255
rom[0x14D]=checksum
rom[0x14E:0x150]=(sum(rom)&65535).to_bytes(2,"big")
OUTPUT.write_bytes(rom)
print(f"{OUTPUT}: {len(rom)} bytes, {len(code)} bytes of original LR35902 code")
