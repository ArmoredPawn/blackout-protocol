"""Deepcore Station, Galleria Mall, Harbor Warehouse."""
from canvas import Canvas


# ════════════════════════════════════════════════════════════════════════
# Deepcore Station: underground lab. Rock tunnels, glass vaults, vents.
# ════════════════════════════════════════════════════════════════════════
def deepcore():
    m = Canvas(44, 40, floors=1)
    F = 0
    # Core: reactor (north), hub, elevator lobby (south), connecting tunnels
    m.room(F, 17, 3, 26, 10, ":")
    m.room(F, 21, 1, 22, 2, ":")
    m.set(F, 22, 0, "E")
    m.room(F, 21, 11, 22, 13)
    for z in (11, 12, 13):
        m.set(F, 17, z, "V")  # crawl shortcut reactor ↔ hub
    m.room(F, 16, 14, 27, 25)
    m.room(F, 21, 26, 22, 28)
    m.room(F, 16, 29, 27, 38, ",")
    m.set(F, 21, 39, "E")
    # East wing (tier 1): specimen vault behind glass + cryo labs
    for z in range(17, 23):
        m.set(F, 28, z, "G")
    m.room(F, 29, 15, 34, 24, ",")
    m.set(F, 28, 15, "1")
    m.room(F, 36, 3, 42, 36, ":")
    m.set(F, 35, 20, "D")
    m.set(F, 43, 30, "E")
    # West wing (tier 2): mining tunnels
    m.set(F, 15, 20, "2")
    m.room(F, 9, 18, 14, 22)
    m.room(F, 11, 4, 12, 17)
    m.room(F, 3, 2, 12, 8, ",")
    m.room(F, 1, 9, 4, 12)
    m.set(F, 0, 10, "E")
    m.room(F, 3, 24, 13, 36, ",")
    m.room(F, 7, 23, 8, 23)
    m.room(F, 1, 13, 2, 23)
    m.room(F, 1, 24, 2, 24)
    for x in range(5, 9):
        m.set(F, x, 13, "V")
    m.room(F, 5, 14, 8, 16)
    m.room(F, 5, 9, 8, 12)
    # Tier 3: deep vault (south-east)
    m.room(F, 29, 28, 34, 38, ",")
    m.set(F, 28, 33, "3")

    # Reactor
    m.puts(F, [(21, 6), (22, 6), (21, 7), (22, 7)], "z")
    m.puts(F, [(17, 3), (26, 3)], "g")
    m.puts(F, [(17, 7), (26, 8)], "T")
    m.put(F, 26, 5, "o")
    m.put(F, 18, 10, "P")
    m.put(F, 21, 9, "H")
    m.puts(F, [(19, 5), (24, 5), (19, 9), (24, 9)], "L")
    # Hub
    m.puts(F, [(19, 17), (24, 17), (19, 22), (24, 22)], "j")
    m.puts(F, [(16, 15), (27, 24)], "o")
    m.puts(F, [(16, 24), (27, 19)], "T")
    m.put(F, 16, 18, "x")
    m.put(F, 27, 14, "P")
    m.puts(F, [(21, 19), (22, 20)], "S")
    m.puts(F, [(21, 16), (21, 23), (25, 20)], "L")
    m.put(F, 18, 20, "*")
    # Elevator lobby
    m.puts(F, [(16, 29), (17, 29)], "n")
    m.puts(F, [(19, 34), (24, 34)], "u")
    m.puts(F, [(16, 33), (16, 36), (27, 37)], "k")
    m.put(F, 27, 31, "T")
    m.put(F, 16, 38, "P")
    m.puts(F, [(21, 31), (21, 36)], "L")
    # Specimen vault
    m.puts(F, [(30, 16), (33, 16), (30, 23), (33, 23)], "x")
    m.put(F, 34, 18, "T")
    m.put(F, 31, 19, "L")
    # Cryo labs
    for z in (5, 9, 13, 24, 28, 32):
        m.row_of(F, z, 38, 40, "l")
    m.puts(F, [(42, 7), (42, 26), (36, 34)], "T")
    m.puts(F, [(42, 15), (36, 11)], "P")
    m.puts(F, [(39, 7), (39, 16), (39, 26), (39, 34)], "L")
    m.puts(F, [(42, 20), (42, 21)], "x")
    m.put(F, 38, 18, "*")
    # Mining tunnels
    m.puts(F, [(3, 2), (4, 2), (12, 8)], "k")
    m.puts(F, [(6, 5), (9, 5)], "m")
    m.puts(F, [(3, 7), (14, 22)], "T")
    m.put(F, 1, 12, "P")
    m.puts(F, [(7, 4), (11, 12), (11, 20)], "L")
    m.puts(F, [(3, 26), (3, 30), (13, 34)], "b")
    m.puts(F, [(6, 28), (10, 28), (6, 32), (10, 32)], "s")
    m.puts(F, [(13, 25), (3, 35)], "T")
    m.put(F, 8, 36, "P")
    m.puts(F, [(8, 26), (8, 34)], "L")
    m.put(F, 7, 15, "*")
    # Deep vault
    for z in (29, 32, 35):
        m.puts(F, [(30, z), (31, z), (33, z), (34, z)], "r")
    m.puts(F, [(29, 37), (34, 37)], "T")
    m.put(F, 32, 38, "P")
    m.puts(F, [(32, 30), (32, 36)], "L")
    return m, dict(
        id="deepcore",
        name="Deepcore Station",
        blurb="underground research station with rock tunnels, glass vaults and vents.",
        description="A buried research station. Tight tunnels, a humming reactor and glass vaults that open as more players join.",
        theme="underground",
        lighting=("#a8d4ff", 0.38, "#06080b", 0.034, "#020304", 1.7),
    ), {}, ["#c8f0ff", "#a0e8ff", "#d0c0ff"]


# ════════════════════════════════════════════════════════════════════════
# Galleria Mall: two-storey atrium with a fountain, galleries and escalators.
# ════════════════════════════════════════════════════════════════════════
def galleria():
    m = Canvas(50, 36, floors=2)
    F0, F1 = 0, 1
    # Core ground floor: atrium, north/south shop rows, two entrances
    m.room(F0, 15, 10, 34, 25, ",")
    m.room(F0, 24, 1, 26, 9)
    m.set(F0, 25, 0, "E")
    m.room(F0, 24, 26, 26, 34)
    m.set(F0, 25, 35, "E")
    shops = [(15, 1, 18, 8), (19, 1, 22, 8), (28, 1, 31, 8), (32, 1, 34, 8),
             (15, 27, 18, 34), (19, 27, 22, 34), (28, 27, 31, 34), (32, 27, 34, 34)]
    for (x0, z0, x1, z1) in shops:
        m.room(F0, x0, z0, x1, z1, ".")
        front = 9 if z0 == 1 else 26
        for x in range(x0, x1 + 1):
            m.set(F0, x, front, "G")
        m.set(F0, (x0 + x1) // 2, front, "D")
    # East wing (tier 1): department store
    m.room(F0, 36, 1, 48, 34, ".")
    m.set(F0, 35, 17, "1")
    m.set(F0, 35, 18, "1")
    m.set(F0, 49, 18, "E")
    # West wing (tier 2): food court
    m.room(F0, 1, 1, 13, 34, ",")
    m.set(F0, 14, 17, "2")
    m.set(F0, 14, 18, "2")
    m.set(F0, 0, 18, "E")

    # Atrium
    m.put(F0, 25, 17, "f")  # fountain
    m.puts(F0, [(18, 13), (31, 13), (18, 21), (31, 21)], "a")
    m.puts(F0, [(22, 13), (28, 13), (22, 22), (28, 22)], "h")
    m.puts(F0, [(15, 17), (34, 13)], "T")
    m.put(F0, 34, 19, "P")
    m.puts(F0, [(21, 18), (29, 18)], "S")
    m.puts(F0, [(20, 15), (30, 15), (20, 20), (30, 20), (25, 12), (25, 23)], "L")
    m.put(F0, 24, 21, "*")
    m.put(F0, 17, 24, "^")
    m.put(F0, 32, 24, "^")
    # Shops: clothing racks, counters, shelves
    for i, (x0, z0, x1, z1) in enumerate(shops):
        back = z0 if z0 == 1 else z1
        mid = (z0 + z1) // 2
        if i % 2 == 0:
            m.puts(F0, [(x0, mid), (x1, mid)], "y")
            m.put(F0, x0 + 1, back, "e")
        else:
            m.puts(F0, [(x0 + 1, mid - 1), (x0 + 1, mid + 1)], "y")
            m.put(F0, x1, back, "s")
        m.put(F0, (x0 + x1) // 2 + 1, mid, "L")
    m.puts(F0, [(15, 4), (34, 31)], "T")
    m.put(F0, 19, 30, "P")
    m.put(F0, 25, 5, "H")
    m.puts(F0, [(25, 3), (25, 30)], "L")
    # Department store
    for z in (4, 8, 12, 23, 27, 31):
        m.row_of(F0, z, 39, 41, "y")
        m.row_of(F0, z, 44, 46, "s")
    m.puts(F0, [(48, 3), (48, 28), (36, 10)], "T")
    m.puts(F0, [(48, 12), (36, 30)], "P")
    m.puts(F0, [(42, 6), (42, 14), (42, 21), (42, 29)], "L")
    m.row_of(F0, 18, 40, 44, "e")
    m.put(F0, 42, 25, "*")
    # Food court
    for z in (6, 11, 24, 29):
        for x in (4, 8):
            m.put(F0, x, z, "t")
    m.row_of(F0, 1, 2, 11, "e")
    m.row_of(F0, 34, 2, 11, "e")
    m.puts(F0, [(1, 8), (13, 26), (1, 27)], "T")
    m.puts(F0, [(13, 4), (1, 32)], "P")
    m.puts(F0, [(6, 8), (6, 17), (6, 27)], "L")
    m.puts(F0, [(4, 17), (9, 17)], "a")
    m.put(F0, 6, 21, "*")

    # Upper floor: gallery ring around the atrium void, upper shops, cinema (tier 3)
    m.void(F1, 0, 0, 49, 35)
    m.fill(F1, 14, 0, 35, 35, "#")
    m.void(F1, 15, 10, 34, 25)
    m.room(F1, 15, 10, 34, 11)
    m.room(F1, 15, 24, 34, 25)
    m.room(F1, 15, 10, 17, 25)
    m.room(F1, 32, 10, 34, 25)
    m.void(F1, 17, 22, 17, 24)  # escalator wells
    m.void(F1, 32, 22, 32, 24)
    for x in range(18, 32):
        m.set(F1, x, 12, "W")
        m.set(F1, x, 23, "W")
    for (x0, z0, x1, z1) in [(15, 1, 22, 8), (27, 1, 34, 8), (15, 27, 22, 34), (27, 27, 34, 34)]:
        m.room(F1, x0, z0, x1, z1, ".")
        front = 9 if z0 == 1 else 26
        for x in range(x0, x1 + 1):
            m.set(F1, x, front, "G")
        m.set(F1, (x0 + x1) // 2, front, "D")
    m.puts(F1, [(15, 3), (34, 30), (22, 5)], "T")
    m.puts(F1, [(34, 4), (15, 32)], "P")
    m.puts(F1, [(18, 4), (31, 4), (18, 30), (31, 30), (25, 10), (25, 25), (16, 17), (33, 17)], "L")
    m.puts(F1, [(27, 5), (28, 5), (29, 5)], "u")
    m.puts(F1, [(17, 30), (19, 30)], "t")
    m.put(F1, 25, 11, "*")
    # Cinema (tier 3)
    m.fill(F1, 35, 4, 49, 31, "#")
    m.room(F1, 36, 5, 48, 30, ",")
    m.set(F1, 35, 17, "3")
    for z in range(9, 28, 3):
        m.row_of(F1, z, 39, 46, "h")
    m.puts(F1, [(48, 6), (36, 28)], "T")
    m.put(F1, 48, 29, "P")
    m.puts(F1, [(42, 7), (42, 18), (42, 28)], "L")
    m.put(F1, 47, 17, "w")
    return m, dict(
        id="galleria",
        name="Galleria Mall",
        blurb="two-storey mall with an open atrium, fountain, galleries and escalators.",
        description="A closed-down shopping mall. Glass storefronts, an atrium fountain and upper galleries. Big lobbies open the department store, food court and cinema.",
        theme="mall",
        lighting=("#ffe8f2", 0.5, "#120e14", 0.018, "#0a0810", 1.3),
    ), {"h": "bench", "e": "counter", "y": "rack", "f": "fountain"}, ["#fff8ee", "#ffe0f0", "#e0f0ff"]


# ════════════════════════════════════════════════════════════════════════
# Harbor Warehouse: shelf-aisle maze, loading docks and an office mezzanine.
# ════════════════════════════════════════════════════════════════════════
def harbor():
    m = Canvas(52, 36, floors=2)
    F0, F1 = 0, 1
    # Core: main hall with aisles, offices north, loading docks south
    m.room(F0, 14, 7, 37, 27)
    m.room(F0, 14, 1, 24, 5, ",")
    m.room(F0, 26, 1, 37, 5, ",")
    m.set(F0, 19, 6, "D")
    m.set(F0, 31, 6, "D")
    m.set(F0, 25, 3, "D")
    m.set(F0, 37, 6, "D")  # foot of the mezzanine stairs
    m.room(F0, 14, 29, 37, 34)
    for x in (17, 18, 25, 26, 33, 34):
        m.set(F0, x, 28, "D")
    m.set(F0, 20, 35, "E")
    m.set(F0, 31, 35, "E")
    # East wing (tier 1): cold storage
    m.room(F0, 39, 1, 50, 34, ":")
    m.set(F0, 38, 12, "1")
    m.set(F0, 38, 22, "1")
    m.set(F0, 51, 17, "E")
    # West wing (tier 2): container yard
    m.room(F0, 1, 1, 12, 34, ",")
    m.set(F0, 13, 10, "2")
    m.set(F0, 13, 24, "2")
    m.set(F0, 0, 30, "E")

    # Aisles: long shelf runs broken by two cross aisles
    for z in (9, 12, 15, 19, 22, 25):
        for x in range(16, 36):
            if x in (21, 30):
                continue  # cross aisles
            m.put(F0, x, z, "s")
    m.puts(F0, [(14, 8), (37, 26), (22, 17)], "T")
    m.puts(F0, [(14, 18), (37, 8)], "P")
    m.puts(F0, [(26, 14), (26, 20)], "S")
    m.puts(F0, [(18, 11), (26, 11), (34, 11), (18, 23), (26, 23), (34, 17), (18, 17)], "L")
    m.put(F0, 30, 17, "*")
    # Offices
    m.puts(F0, [(16, 3), (20, 3), (29, 3), (33, 3)], "d")
    m.puts(F0, [(16, 4), (20, 4), (29, 4), (33, 4)], "c")
    m.puts(F0, [(14, 1), (36, 1)], "f")
    m.put(F0, 24, 1, "T")
    m.puts(F0, [(19, 2), (31, 2)], "L")
    m.put(F0, 37, 5, "^")  # stairs to the mezzanine
    # Loading docks
    m.puts(F0, [(16, 31), (23, 31), (29, 31)], "y")
    m.puts(F0, [(14, 29), (15, 29), (37, 34), (36, 34)], "k")
    m.puts(F0, [(21, 33), (30, 33)], "e")
    m.put(F0, 37, 30, "T")
    m.put(F0, 14, 34, "P")
    m.put(F0, 26, 32, "H")
    m.puts(F0, [(19, 31), (32, 31)], "L")
    # Cold storage
    for z in (3, 7, 11, 23, 27, 31):
        m.row_of(F0, z, 41, 44, "k")
        m.row_of(F0, z, 47, 48, "b")
    m.puts(F0, [(50, 5), (50, 29), (39, 17)], "T")
    m.puts(F0, [(50, 14), (39, 33)], "P")
    m.puts(F0, [(45, 5), (45, 17), (45, 29)], "L")
    m.put(F0, 45, 19, "*")
    # Container yard: big crate stacks as cover
    for (x, z) in [(3, 3), (3, 4), (8, 3), (9, 3), (3, 12), (4, 12), (9, 14), (9, 15), (3, 20), (8, 21), (3, 27), (4, 27), (9, 30)]:
        m.put(F0, x, z, "x")
    m.puts(F0, [(1, 7), (12, 18), (1, 33)], "T")
    m.puts(F0, [(12, 4), (6, 24)], "P")
    m.puts(F0, [(6, 6), (6, 16), (6, 29)], "L")
    m.put(F0, 6, 11, "*")

    # Mezzanine (tier 3) above the north offices, reached by the stairs at (37,5)
    m.void(F1, 0, 0, 51, 35)
    m.fill(F1, 13, 0, 38, 6, "#")
    m.room(F1, 14, 1, 37, 5, ",")
    m.void(F1, 37, 3, 37, 5)  # stairwell
    m.set(F1, 37, 2, "3")
    m.room(F1, 37, 1, 37, 1, ",")
    m.puts(F1, [(14, 3), (25, 1)], "T")
    m.put(F1, 30, 1, "P")
    m.puts(F1, [(17, 1), (21, 1)], "r")
    m.puts(F1, [(18, 4), (27, 4)], "t")
    m.puts(F1, [(19, 3), (27, 2), (33, 3)], "L")
    return m, dict(
        id="harbor",
        name="Harbor Warehouse",
        blurb="dockside warehouse with shelf aisles, loading docks, cold storage and a container yard.",
        description="Towering shelf aisles make a maze around the loading docks. Big lobbies unlock cold storage, the container yard and the mezzanine.",
        theme="warehouse",
        lighting=("#dfe9ff", 0.42, "#0c0f12", 0.022, "#07090b", 1.5),
    ), {"y": "forklift", "e": "pallet", "x": "crates"}, ["#f2f6ff", "#e0ecff"]
