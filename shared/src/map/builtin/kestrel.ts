import { buildAsciiMap } from "./ascii.js";

/**
 * Kestrel Research Facility - a two-storey lab complex.
 * Core (all sizes): labs, atrium, reception, security, entrance hall, upper offices & lounge.
 * Tier 1 (6+ players) opens the east wing: server hall, offices, break room, loading dock.
 * Tier 2 (11+) opens the west wing: containment block, specimen lab, cold storage.
 * Tier 3 (16+) opens the upstairs archive.
 */
export const kestrel = buildAsciiMap({
  id: "kestrel",
  name: "Kestrel Research Facility",
  description: "Sterile labs, a double-height atrium and sealed wings that open up as the lobby grows.",
  theme: "facility",
  lighting: { ambient: "#9fb4d8", ambientIntensity: 0.5, fog: "#0a0e16", fogDensity: 0.022, sky: "#05070c", lamp: 1.4 },
  lightColors: ["#dfe9ff", "#dfe9ff", "#bfe0ff", "#ffe2b8"],
  floors: [
    `
##########################E#################
#,,,#,,,#,,,#w,,,s,,,s#r,,,,,,r#rrr,,,,,rrr#
#,P,#,P,#,*,#,,,,,,,,,#r,,,,,,r#,,,,,,,,,,,#
#,,,#,,,#,,,#,ll,,,ll,#,,,H,,,,#rr,,,T,,,rr#
##D###D###D##,,,,T,,,,#,oo,,T,,#,,,,,,,,,,,#
#:::::L:::::#,ll,,,ll,D,,,,,,,,#rr,,,L,,,rr#
##D###D###D##,,,,,,,,,#,,,,,,P,#,,,,,,,,,,,#
#,,,#,,,#,,,#x,,,L,,,x#,,,L,,,,#rr,,,,,,,rr#
#,T,#,,,#,P,#,,,,,,,,,#r,,,,,,r#,,,P,,,T,,,#
#k,,#,,,#,,,#f,,,,,,,o#r,,,,,,r#o,,,,,,,,,o#
######D##########D########D########D########
#,,,,,,,,,,,#p................p#d,c,,#d,c,,#
#x,x,x,,,,,,#..................#,,,,,#,,,,,#
#,,,,,,,ll,,#....a........a....#y,T,,#y,,T,#
#,,,,,T,,,,,#......eeeee.......#,,,,,#,,,,,#
#,,,,,,,ll,,#......,,T,,.......###D######D##
#x,x,x,,,,,,2.........L........1....L....*.#
#,,,,,,,,,,,#.W.W.......u...*..####D###D####
#zz,,,L,,,zz#.W.W.......u......#,,,,,,,,,,,#
#,,,,,,,,,,,#.W^W..........P...#,tt,,,,,u,,#
#o,,,,P,,,,o#..................#,tt,,P,,u,,#
#,,,,,,,,,,,#p......S.S.......p#n,,,,,,,,,n#
######D########D######D####D######D#########
#ss,ss,ss,,,#o,,,f#..p......p..#kk,,,,,,,kk#
#,,,,,,,,,,,#,,,,,#............#k,,,,,,,,,,#
#ss,ss,ss,,T#,T,,,D............#,,,mm,,,,,,#
#,,,,,,,,,,,#,,,,,#...j....j...#,,,mm,,T,,,#
#kk,,,,b,,,,#d,,,,#............#,,,,,,,,,,,E
E,,,,L,,,,,,#c,,P,#....n...L...1,,,,,,,,,,,#
#ss,ss,,,,kk#,,,,,#...j....j...#kk,,,,,,b,,#
#,,,,,,,*,,,#######............#,,,,L,,,,,,#
#ss,ss,,P,,,#a..........u.....a#k,,,P,,,,bb#
#k,,,,,,,,,,2..................#kk,,,,,,,,,#
#####################E######################
`,
    `
            ####################            
            #y,,,y,,,y#y,y,y,y,#            
            #,,,,,,,,,#,,,,,,,,#            
            #,dc,,,,T,#,,T,,,,,#            
            #,,,,L,,,,3,,,,L,,,#            
            #,u,,,,,,,#y,y,,y,y#            
            #,u,,,,,P,#,,,,,,P,#            
            #,,,,,,,,,#,,,,,,,,#            
            #####D#########3####            
            #..................#            
            #.jj.....T.....jj..#            
            #..................#            
            #..u..........*....#            
            #......L...........#            
            #..e....aa......T..#            
            #..................#            
            #WW.WWWWWWWWWWWWWWW#            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
                                            
`,
  ],
});
