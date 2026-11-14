"""
Generates the built-in map modules in shared/src/map/builtin/.

Every map is authored at its largest size. Tier gates ('1', '2', '3') seal
wings that open as the lobby grows (6+, 11+, 16+ players). The runtime
computes which objects are reachable at each tier, so objects inside a sealed
wing simply don't exist in smaller games.

    python tools/mapgen/build_maps.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from canvas import Canvas  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "src", "map", "builtin")


# ════════════════════════════════════════════════════════════════════════
# Ironworks Foundry: industrial. Open foundry hall with a catwalk ring.
# ════════════════════════════════════════════════════════════════════════
def foundry():
    m = Canvas(50, 34, floors=2)
    F0 = 0
    # Core
    m.room(F0, 15, 9, 34, 24)  # foundry hall
    m.room(F0, 15, 1, 22, 7, ",")  # control room
    m.room(F0, 24, 1, 34, 7, ",")  # break room
    m.room(F0, 15, 26, 34, 32)  # loading bay
    for x in (18, 29):
        m.set(F0, x, 8, "D")
    m.set(F0, 33, 8, "V")  # crawl vent: break room ↔ hall
    for x in (18, 19, 30, 31):
        m.set(F0, x, 25, "D")
    m.set(F0, 19, 0, "E")
    m.set(F0, 25, 33, "E")
    # East wing (tier 1): smelter + storage
    m.room(F0, 36, 1, 48, 15, ":")
    m.room(F0, 36, 17, 48, 32, ",")
    m.set(F0, 42, 16, "D")
    m.set(F0, 35, 12, "1")
    m.set(F0, 35, 29, "1")
    m.set(F0, 49, 24, "E")
    # West wing (tier 2): boiler room + workshop
    m.room(F0, 1, 1, 13, 14)
    m.room(F0, 1, 16, 13, 32, ",")
    m.set(F0, 7, 15, "D")
    m.set(F0, 14, 5, "2")
    m.set(F0, 14, 18, "2")
    m.set(F0, 0, 8, "E")

    # Hall
    m.puts(F0, [(18, 12), (18, 16), (31, 16)], "m")
    m.puts(F0, [(31, 11), (33, 11)], "z")
    m.row_of(F0, 19, 21, 29, "h")  # conveyor line
    m.puts(F0, [(24, 9), (34, 22), (15, 13)], "T")
    m.puts(F0, [(15, 24), (34, 14)], "P")
    m.puts(F0, [(24, 16), (26, 16), (25, 14)], "S")
    m.puts(F0, [(20, 14), (29, 22)], "*")
    m.puts(F0, [(19, 11), (25, 12), (31, 18), (21, 22), (28, 22)], "L")
    m.put(F0, 16, 22, ">")  # stairs to catwalk
    # Control room
    m.row_of(F0, 1, 15, 17, "o")
    m.puts(F0, [(22, 4)], "T")
    m.puts(F0, [(16, 6)], "d")
    m.puts(F0, [(17, 6)], "c")
    m.put(F0, 19, 4, "L")
    # Break room
    m.row_of(F0, 1, 24, 27, "q")
    m.puts(F0, [(34, 3)], "n")
    m.puts(F0, [(28, 4), (31, 4)], "t")
    m.put(F0, 34, 6, "P")
    m.put(F0, 29, 3, "L")
    # Loading bay
    m.puts(F0, [(15, 26), (16, 26), (15, 27), (33, 32), (34, 31)], "k")
    m.puts(F0, [(20, 31), (21, 31), (29, 31)], "e")
    m.put(F0, 32, 28, "y")
    m.put(F0, 34, 27, "T")
    m.put(F0, 25, 30, "H")
    m.puts(F0, [(25, 28), (18, 29)], "L")
    # East smelter
    m.puts(F0, [(37, 1), (39, 1), (41, 1)], "z")
    m.puts(F0, [(44, 6), (44, 10)], "m")
    m.puts(F0, [(48, 4), (48, 8)], "g")
    m.puts(F0, [(36, 8), (48, 12)], "T")
    m.put(F0, 40, 14, "P")
    m.puts(F0, [(42, 8), (39, 12)], "L")
    m.put(F0, 45, 13, "*")
    # East storage
    for z in (19, 23, 27):
        m.row_of(F0, z, 38, 40, "s")
        m.row_of(F0, z, 43, 45, "s")
    m.put(F0, 48, 20, "T")
    m.put(F0, 37, 31, "P")
    m.puts(F0, [(42, 21), (42, 29)], "L")
    m.puts(F0, [(47, 31), (47, 32), (48, 32)], "k")
    # West boiler room
    m.puts(F0, [(2, 2), (4, 2), (6, 2), (2, 5)], "z")
    m.puts(F0, [(1, 10), (1, 12)], "g")
    m.puts(F0, [(13, 3), (7, 9)], "T")
    m.put(F0, 11, 12, "P")
    m.puts(F0, [(7, 6), (5, 12)], "L")
    # West workshop
    m.puts(F0, [(4, 20), (9, 20), (4, 26), (9, 26)], "t")
    m.puts(F0, [(1, 28), (1, 30)], "m")
    m.puts(F0, [(1, 22), (13, 30)], "T")
    m.put(F0, 11, 32, "P")
    m.put(F0, 6, 29, "*")
    m.puts(F0, [(7, 18), (7, 24), (7, 30)], "L")

    # Floor 1: catwalk ring over the hall (tier 3 via the shutter at the top of the stairs)
    F1 = 1
    m.void(F1, 0, 0, 49, 33)
    m.fill(F1, 14, 8, 35, 25, "#")
    m.void(F1, 15, 9, 34, 24)
    m.room(F1, 15, 9, 34, 10, ":")
    m.room(F1, 15, 22, 34, 24, ":")
    m.room(F1, 15, 9, 16, 24, ":")
    m.room(F1, 33, 9, 34, 24, ":")
    m.void(F1, 16, 22, 18, 22)  # stairwell
    m.set(F1, 19, 22, "3")
    m.puts(F1, [(34, 16), (15, 12)], "T")
    m.puts(F1, [(25, 24), (34, 9)], "P")
    m.puts(F1, [(25, 9), (24, 23), (33, 17)], "L")
    m.put(F1, 33, 23, "*")
    return m, dict(
        id="foundry",
        name="Ironworks Foundry",
        blurb="industrial plant with a catwalk ring, vents and sealed wings.",
        description="A roaring foundry floor ringed by catwalks, with boiler rooms and storage wings for bigger lobbies.",
        theme="industrial",
        lighting=("#ffd9a8", 0.45, "#16120c", 0.024, "#0c0a07", 1.5),
    ), {"h": "conveyor", "e": "pallet", "y": "forklift"}, ["#ffe2b0", "#ffcf8a", "#fff0d0"]


# ════════════════════════════════════════════════════════════════════════
# Hillcrest High: school. Hallway spine, classrooms, gym and cafeteria.
# ════════════════════════════════════════════════════════════════════════
def hillcrest():
    m = Canvas(46, 36, floors=2)
    F0 = 0
    # Core (x 17..28): central corridor, six classrooms, cross corridor, entrance hall
    m.room(F0, 22, 1, 23, 26)
    m.room(F0, 17, 16, 28, 18)
    for (x0, x1) in ((17, 20), (25, 28)):
        for (z0, z1) in ((1, 7), (9, 14), (20, 26)):
            m.room(F0, x0, z0, x1, z1, ",")
    for z in (4, 11, 23):
        m.set(F0, 21, z, "D")
        m.set(F0, 24, z, "D")
    m.room(F0, 17, 28, 28, 34)
    m.set(F0, 22, 27, "D")
    m.set(F0, 23, 27, "D")
    m.set(F0, 22, 35, "E")
    m.set(F0, 23, 0, "E")
    # East wing (tier 1): gym + cafeteria
    m.room(F0, 30, 1, 44, 14, ",")
    m.room(F0, 30, 16, 44, 18)
    m.room(F0, 30, 20, 44, 34)
    for x in (34, 40):
        m.set(F0, x, 15, "D")
        m.set(F0, x, 19, "D")
    m.set(F0, 29, 17, "1")
    m.set(F0, 45, 17, "E")
    # West wing (tier 2): library + science labs
    m.room(F0, 1, 1, 15, 14, ",")
    m.room(F0, 1, 16, 15, 18)
    m.room(F0, 1, 20, 15, 34, ":")
    m.set(F0, 8, 15, "D")
    m.set(F0, 8, 19, "D")
    m.set(F0, 16, 17, "2")
    m.set(F0, 0, 17, "E")

    # Classrooms: desk grid + whiteboard
    def classroom(f, x0, z0, x1, z1, board_x):
        for z in range(z0 + 2, z1, 2):
            for x in range(x0 + (1 if board_x < x0 + 2 else 0), x1 + (0 if board_x < x0 + 2 else -1)):
                if m.get(f, x, z) in ".,:" and (x - x0) % 2 == 0:
                    m.put(f, x, z, "d")

    for (x0, x1, bx) in ((17, 20, 17), (25, 28, 28)):
        for (z0, z1) in ((1, 7), (9, 14), (20, 26)):
            m.put(F0, bx, z0, "w")
            classroom(F0, x0, z0, x1, z1, bx)
    m.puts(F0, [(18, 3), (28, 21), (17, 10)], "T")
    m.puts(F0, [(18, 9), (26, 1)], "L")
    m.puts(F0, [(19, 22), (26, 11), (19, 5)], "L")
    m.puts(F0, [(22, 2), (22, 7), (22, 9), (22, 14)], "q")
    m.puts(F0, [(23, 20), (23, 25)], "q")
    m.puts(F0, [(28, 16)], "P")
    m.puts(F0, [(17, 18)], "*")
    m.puts(F0, [(20, 17), (26, 17)], "L")
    # Entrance hall
    m.puts(F0, [(24, 30), (25, 30), (26, 30)], "e")
    m.puts(F0, [(17, 28), (28, 28)], "a")
    m.put(F0, 28, 33, "T")
    m.put(F0, 28, 31, "P")
    m.puts(F0, [(21, 32), (24, 32)], "S")
    m.puts(F0, [(22, 30), (22, 33)], "L")
    m.put(F0, 18, 33, "^")  # stairs up
    m.put(F0, 22, 12, "H")
    # Gym
    for x in range(31, 44, 2):
        m.put(F0, x, 1, "h")
    m.puts(F0, [(30, 7), (44, 3)], "T")
    m.put(F0, 44, 13, "P")
    m.puts(F0, [(34, 5), (40, 5), (34, 10), (40, 10)], "L")
    m.put(F0, 37, 8, "*")
    # Cafeteria
    m.row_of(F0, 34, 33, 38, "e")
    for x in (32, 36, 40):
        for z in (23, 27):
            m.put(F0, x, z, "t")
    m.puts(F0, [(44, 30)], "T")
    m.put(F0, 30, 33, "P")
    m.puts(F0, [(44, 21), (44, 22)], "n")
    m.puts(F0, [(36, 25), (36, 31)], "L")
    m.puts(F0, [(37, 17)], "L")
    # Library
    for z in (3, 6, 9):
        m.row_of(F0, z, 4, 7, "y")
        m.row_of(F0, z, 10, 13, "y")
    m.puts(F0, [(1, 6), (15, 12)], "T")
    m.put(F0, 1, 13, "P")
    m.puts(F0, [(8, 4), (8, 11)], "L")
    m.puts(F0, [(3, 12), (5, 12)], "t")
    # Science labs
    for z in (22, 25, 28, 31):
        m.row_of(F0, z, 4, 6, "l")
        m.row_of(F0, z, 10, 12, "l")
    m.puts(F0, [(15, 25), (1, 32)], "T")
    m.put(F0, 1, 21, "P")
    m.puts(F0, [(8, 23), (8, 30)], "L")
    m.put(F0, 8, 33, "*")
    m.puts(F0, [(8, 17)], "L")

    # Floor 1: upstairs classrooms (tier 0) + art studio wing (tier 3)
    F1 = 1
    m.void(F1, 0, 0, 45, 35)
    m.fill(F1, 16, 0, 29, 35, "#")
    m.fill(F1, 0, 0, 16, 15, "#")
    m.room(F1, 22, 1, 23, 34)
    for (x0, x1) in ((17, 20), (25, 28)):
        for (z0, z1) in ((1, 7), (9, 15), (17, 23)):
            m.room(F1, x0, z0, x1, z1, ",")
            m.set(F1, 21 if x0 == 17 else 24, (z0 + z1) // 2, "D")
    m.room(F1, 25, 25, 28, 34, ",")  # music room
    m.set(F1, 24, 29, "D")
    m.room(F1, 17, 25, 20, 34)  # landing
    m.void(F1, 18, 31, 18, 33)
    m.puts(F1, [(17, 31), (17, 32), (19, 31), (19, 32)], "W")
    m.set(F1, 21, 28, "D")
    m.room(F1, 1, 1, 15, 14, ",")  # art studio + computer lab (tier 3)
    m.set(F1, 16, 11, "3")
    for (x0, x1, bx) in ((17, 20, 17), (25, 28, 28)):
        for (z0, z1) in ((1, 7), (9, 15), (17, 23)):
            m.put(F1, bx, z0, "w")
            classroom(F1, x0, z0, x1, z1, bx)
    m.puts(F1, [(17, 13), (28, 5), (28, 19)], "T")
    m.puts(F1, [(28, 34), (17, 17)], "P")
    m.puts(F1, [(19, 4), (26, 12), (19, 20), (26, 20), (22, 30)], "L")
    m.puts(F1, [(26, 32), (27, 32)], "u")
    m.put(F1, 23, 18, "*")
    m.puts(F1, [(1, 3), (15, 13)], "T")
    m.put(F1, 8, 1, "P")
    m.puts(F1, [(3, 6), (6, 6), (9, 6), (12, 6)], "r")
    m.puts(F1, [(3, 10), (6, 10), (9, 10)], "t")
    m.puts(F1, [(5, 3), (11, 12)], "L")
    return m, dict(
        id="hillcrest",
        name="Hillcrest High",
        blurb="two-storey school with a hallway spine, gym, cafeteria and library.",
        description="Lockers, classrooms and a long central hallway. Bigger lobbies unlock the gym, cafeteria, library and labs.",
        theme="school",
        lighting=("#fff2dc", 0.55, "#14120f", 0.02, "#0a0907", 1.3),
    ), {"h": "bench", "e": "counter"}, ["#fff4dc", "#ffe8c0"]


from maps2 import deepcore, galleria, harbor  # noqa: E402

MAPS = [("foundry", foundry), ("hillcrest", hillcrest), ("deepcore", deepcore), ("galleria", galleria), ("harbor", harbor)]

if __name__ == "__main__":
    only = sys.argv[1:] or [k for k, _ in MAPS]
    for key, fn in MAPS:
        if key not in only:
            continue
        canvas, meta, legend, lights = fn()
        canvas.emit_ts(os.path.join(OUT, f"{key}.ts"), key, meta, legend, lights)
        print("wrote", key)
        if "--preview" in os.environ.get("MAPGEN", ""):
            canvas.preview()
