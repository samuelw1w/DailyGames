// Middleman catalog: every answer a player can pick, per scale.
// Format per line: Name|emoji|value|alias1,alias2
// Units: weight = kg, speed = mph, size = metres, year = calendar year (negative = BCE), price = USD.
// IDs are derived from the name (see puzzle.js), so renaming an item changes its ID.
// Daily puzzles are generated from this file, on both the site and the API. Any edit changes
// the pairs for every date, including today, so ship catalog changes right after midnight
// and deploy the site and API together (they share this file, so one deploy does both).

export const RAW = {
weight:`Mosquito|🦟|0.0000025
Ant|🐜|0.000003
Ladybug|🐞|0.00002
Feather|🪶|0.00005
Honeybee|🐝|0.0001|bee
Butterfly|🦋|0.0005
Paperclip|📎|0.001
Hummingbird|🐦|0.004
Grape|🍇|0.005
Snail|🐌|0.005
Quarter coin|🪙|0.0057|coin,quarter
Pencil|✏️|0.006
Key|🔑|0.01
Strawberry|🍓|0.012
Mouse|🐭|0.02
AA battery|🔋|0.023|battery
Frog|🐸|0.025
Golf ball|⛳|0.046
Egg|🥚|0.05
Tennis ball|🎾|0.058
Cupcake|🧁|0.08
Banana|🍌|0.12
Hamster|🐹|0.13
Baseball|⚾|0.145
Apple|🍎|0.18
Smartphone|📱|0.19|phone,iphone
Avocado|🥑|0.2
Potato|🥔|0.2
Rat|🐀|0.3
Pigeon|🕊️|0.35|dove
Coffee mug|☕|0.35|mug
Teddy bear|🧸|0.4
Soccer ball|⚽|0.43|football
Squirrel|🐿️|0.5
Violin|🎻|0.5
Book|📕|0.5
Hammer|🔨|0.6
Basketball|🏀|0.62
Lobster|🦞|0.7
Hedgehog|🦔|0.8
Crab|🦀|1
Whole pizza|🍕|1|pizza
Parrot|🦜|1.1|macaw
Duck|🦆|1.2
Coconut|🥥|1.4
Owl|🦉|1.5
Laptop|💻|1.6|computer
Pineapple|🍍|1.6
Rabbit|🐇|2|bunny
Brick|🧱|2.3
Chicken|🐔|2.5|hen
Skateboard|🛹|2.5
Skunk|🦨|3
Flamingo|🦩|3
Guitar|🎸|3.5
House cat|🐈|4.5|cat,kitten
Eagle|🦅|5
Peacock|🦚|5
Sloth|🦥|5
Pumpkin|🎃|5
Fox|🦊|6
Bowling ball|🎳|6.5
Monkey|🐒|7
Raccoon|🦝|7
Chair|🪑|7
Turkey|🦃|8
Watermelon|🍉|9
Koala|🐨|9
Beagle|🐕|10|dog
Otter|🦦|10
Badger|🦡|10
Swan|🦢|10
Car tire|🛞|10|tire,tyre,wheel
Bicycle|🚲|12|bike
Octopus|🐙|15
Beaver|🦫|20
Golden retriever|🦮|30|retriever,labrador,big dog
Emperor penguin|🐧|30|penguin
Toilet|🚽|40
Wolf|🐺|40
Goat|🐐|50
Kangaroo|🦘|55
Leopard|🐆|60|cheetah,jaguar
Orangutan|🦧|60|ape
Adult human|🧍|70|human,person,man,woman
Sheep|🐑|70|lamb
Couch|🛋️|80|sofa
Deer|🦌|80
Panda|🐼|100
Pig|🐖|150|hog
Gorilla|🦍|160
Llama|🦙|160|alpaca
Lion|🦁|190
Dolphin|🐬|200
Motorcycle|🏍️|200|motorbike
Tiger|🐅|220
Upright piano|🎹|250|piano
Grizzly bear|🐻|300|bear
Zebra|🦓|350
Polar bear|🐻‍❄️|450
Moose|🫎|450|elk
Camel|🐫|450
Crocodile|🐊|450|alligator
Horse|🐎|500|pony
Cow|🐄|700|bull,cattle
Bison|🦬|900|buffalo
Giraffe|🦒|1000
Great white shark|🦈|1100|shark
Car|🚗|1400|sedan
Hippo|🦛|1500|hippopotamus
Rhino|🦏|2300|rhinoceros
Pickup truck|🛻|2500|truck
Helicopter|🚁|2700
Tractor|🚜|5000
Elephant|🐘|6000
Woolly mammoth|🦣|6000|mammoth
T. rex|🦖|8000|t-rex,trex,tyrannosaurus,dinosaur
School bus|🚌|11000|bus
Fire truck|🚒|18000|fire engine
Humpback whale|🐋|30000|whale
Jet airliner|✈️|41000|airplane,plane,737,jet
Brachiosaurus|🦕|50000|sauropod,brontosaurus
Blue whale|🐳|150000
Locomotive|🚂|200000|train
Statue of Liberty|🗽|204000
Eiffel Tower|🗼|10100000
Cruise ship|🛳️|100000000|ship`,
speed:`Glacier|🧊|0.00003|ice
Snail|🐌|0.03
Sloth|🦥|0.15
Giant tortoise|🐢|0.2|tortoise,turtle
Mosquito|🦟|1
Walking person|🚶|3|walking,walk,human,person
Rowboat|🚣|4|rowing
Housefly|🪰|4.5|fly
Canoe|🛶|4.5|kayak
Olympic swimmer|🏊|5|swimmer,swimming
Sailboat|⛵|8|boat
Mouse|🐭|8
Chicken|🐔|9|hen
Skateboard|🛹|10
Crocodile (on land)|🐊|11|crocodile,alligator
Pig|🐖|11
Butterfly|🦋|11
Bicycle|🚲|12|bike,cyclist
Black mamba|🐍|12|snake
Honeybee|🐝|15|bee
Bowling ball|🎳|17
Hippo|🦛|19|hippopotamus
Squirrel|🐿️|20
Dolphin|🐬|22
Gentoo penguin|🐧|22|penguin
Elephant|🐘|25
Great white shark|🦈|25|shark
Tractor|🚜|25
Cruise ship|🛳️|25|ship
Fastest sprinter|🏃|28|usain bolt,sprinter,runner,running
House cat|🐈|30|cat
Fox|🦊|30
Deer|🦌|30
Rabbit|🐇|30|bunny
Speed skater|⛸️|30|skater,skating
Giraffe|🦒|35
Grizzly bear|🐻|35|bear
Rhino|🦏|35|rhinoceros
Wolf|🐺|38
Zebra|🦓|40
Camel|🐫|40
Kangaroo|🦘|44
Racehorse|🐎|44|horse
Greyhound|🐕|45|dog
Lion|🦁|50
Flying duck|🦆|55|duck,mallard
School bus|🚌|55|bus
Steam train|🚂|60|train,locomotive
Racing pigeon|🕊️|60|pigeon
Ping-pong smash|🏓|60|ping pong,table tennis
Speedboat|🚤|60|motorboat
Car on the highway|🚗|65|car
Cheetah|🐆|70
Soccer kick|⚽|70|soccer ball
Downhill skier|⛷️|80|skier,skiing
Baseball pitch|⚾|95|fastball,baseball
Tennis serve|🎾|130|tennis ball
Small plane|🛩️|140|cessna
Fastest roller coaster|🎢|149|roller coaster
Hurricane (Cat 5)|🌀|160|hurricane
Helicopter|🚁|160
Golf ball off the tee|⛳|170|golf ball,golf
Sport motorcycle|🏍️|180|motorcycle
Bullet train|🚄|200|shinkansen
Formula 1 car|🏎️|230|race car,f1
Peregrine falcon dive|🦅|240|falcon,peregrine
Tornado (EF5)|🌪️|260|tornado
Badminton smash|🏸|300|shuttlecock,badminton
Jet airliner|✈️|560|airplane,plane,jet
Speed of sound|🔊|767|sound
Earth's spin at the equator|🌍|1040|earth
Space station|🛰️|17150|iss
Rocket at escape velocity|🚀|25000|rocket
Earth orbiting the Sun|☀️|67000|orbit
Light|💡|670616629|speed of light`,
size:`Bacterium|🦠|0.000002|bacteria,germ
Red blood cell|🩸|0.000008|blood cell
Human hair (width)|💇|0.00007|hair
Sheet of paper (thickness)|📄|0.0001|paper
Ant|🐜|0.005
Snowflake|❄️|0.005
Grain of rice|🍚|0.006|rice
Ladybug|🐞|0.007
Honeybee|🐝|0.015|bee
Quarter coin|🪙|0.024|coin,quarter
Paperclip|📎|0.03
Mouse|🐭|0.08
Credit card|💳|0.086
Smartphone|📱|0.15|phone,iphone
Hamster|🐹|0.15
Banana|🍌|0.18
Pencil|✏️|0.19
Sneaker|👟|0.29|shoe
Ruler|📏|0.3
Pizza|🍕|0.4
House cat|🐈|0.46|cat
Guitar|🎸|1
Golden retriever|🦮|1.1|dog,retriever
Upright piano|🎹|1.5|piano
Adult human|🧍|1.7|person,human,man,woman
Kangaroo|🦘|1.8
Bicycle|🚲|1.8|bike
Bed|🛏️|2
Door|🚪|2
Couch|🛋️|2.2|sofa
Horse|🐎|2.4
Sunflower|🌻|2.5
Polar bear (standing)|🐻‍❄️|2.6|polar bear
Basketball hoop|🏀|3.05|hoop
Elephant (height)|🐘|3.3|elephant
Car|🚗|4.5
Great white shark|🦈|4.6|shark
Crocodile|🐊|5|alligator
Giraffe|🦒|5.5
Anaconda|🐍|6|snake
School bus|🚌|12|bus
T. rex|🦖|12|t-rex,trex,dinosaur
Bowling lane|🎳|18
Subway car|🚇|18|subway,train car
Palm tree|🌴|20|tree
Hot air balloon|🎈|20|balloon
Tennis court|🎾|23.8
Blue whale|🐳|25|whale
Olympic pool|🏊|50|pool,swimming pool
Jumbo jet|✈️|70|747,airplane,plane
Statue of Liberty|🗽|93
Big Ben|🕰️|96|clock tower
Soccer field|⚽|105|soccer pitch
Football field|🏈|110|american football
Saturn V rocket|🚀|110|rocket
Tallest redwood|🌲|116|redwood,sequoia
London Eye|🎡|135|ferris wheel
Titanic|🚢|269|ship
Eiffel Tower|🗼|330
Aircraft carrier|⚓|333|carrier
Cruise ship|🛳️|360
Empire State Building|🏙️|443|empire state,skyscraper
Burj Khalifa|🏗️|828|tallest building
Grand Canyon (depth)|🏜️|1800|grand canyon
Golden Gate Bridge|🌉|2737|bridge
Mount Fuji|🗻|3776|fuji
Central Park|🌳|4000|park
Mount Everest|🏔️|8849|everest,mountain
Manhattan|🌆|21600|nyc
Strait of Dover|🌊|33000|english channel
Marathon|🏃|42195|marathon route
Mississippi River|🏞️|3730000|mississippi,river
Earth (diameter)|🌍|12742000|earth,planet
Moon (distance away)|🌙|384400000|moon
Sun (diameter)|☀️|1390000000|sun`,
year:`The wheel|🛞|-3500|wheel
Writing|✍️|-3200
Great Pyramid of Giza|🔺|-2560|pyramid,pyramids
Stonehenge|🪨|-2500
Olympic Games|🏅|-776|olympics
Coins|🪙|-600|coin,money
Great Wall of China|🧱|-220|great wall
Colosseum|🏟️|80
Paper|📜|105
Chess|♟️|600
Compass|🧭|1040
Eyeglasses|👓|1286|glasses
Printing press|📰|1440
Pencil|✏️|1565
Telescope|🔭|1608
Piano|🎹|1700
Steam engine|🚂|1712
Sandwich|🥪|1762
Hot air balloon|🎈|1783|balloon
Vaccine|💉|1796
Battery|🔋|1800
Bicycle|🚲|1817|bike
Photograph|📷|1826|photo,camera
Telegraph|📠|1837
Postage stamp|✉️|1840|stamp
Chocolate bar|🍫|1847|chocolate
Modern soccer rules|⚽|1863|soccer,football
Jeans|👖|1873|denim
Telephone|☎️|1876|phone
Light bulb|💡|1879|lightbulb
Car|🚗|1886|automobile
Pizza Margherita|🍕|1889|pizza
Basketball|🏀|1891
Radio|📻|1895
Teddy bear|🧸|1902
Airplane|✈️|1903|plane,wright brothers
Crayons|🖍️|1903|crayon
Ice cream cone|🍦|1904
Zipper|🤐|1913
Traffic light|🚦|1914
Television|📺|1927|tv
Penicillin|💊|1928|antibiotics
Sliced bread|🍞|1928|bread
Ballpoint pen|🖊️|1938|pen
Microwave oven|🍿|1946|microwave
Credit card|💳|1950
Video game|🕹️|1958|videogame
Moon landing|🌕|1969|apollo 11
Email|📧|1971|e-mail
Cell phone|📱|1973|mobile phone
Personal computer|💻|1975|computer,pc
Sticky note|🗒️|1980|post-it
Compact disc|💿|1982|cd
World Wide Web|🌐|1989|web,internet
Emoji|😀|1999
Touchscreen smartphone|📲|2007|smartphone,iphone`,
price:`Banana|🍌|0.3
Egg|🥚|0.3
Pencil|✏️|0.5
Postage stamp|✉️|0.78|stamp
Apple|🍎|1
Pack of gum|🍬|1.5|gum,candy
Donut|🍩|1.5|doughnut
Avocado|🥑|1.5
Bottle of water|💧|2|water
Bagel|🥯|2
Candy bar|🍫|2|chocolate
Subway ride (NYC)|🚇|2.9|subway,metro
Taco|🌮|3
Gallon of gas|⛽|3.2|gas,gasoline
Slice of pizza|🍕|3.5|pizza
Toothbrush|🪥|4
Ice cream cone|🍦|5|ice cream
Latte|☕|5.5|coffee
Bubble tea|🧋|6|boba
Fast-food burger|🍔|7|burger,hamburger
Burrito|🌯|11
Movie ticket|🎬|13|movie
Streaming subscription|🎞️|15|netflix
Paperback book|📕|15|book
Cocktail|🍸|18|drink
Bottle of wine|🍷|18|wine
T-shirt|👕|20|shirt
Umbrella|☂️|20
Teddy bear|🧸|20
Baseball cap|🧢|25|hat,cap
Taxi ride|🚕|25|taxi,uber,cab
Basketball|🏀|30
Haircut|💇|35
Backpack|🎒|50
Bouquet of roses|💐|60|flowers,roses
Jeans|👖|60
Steak dinner|🥩|60|steak
Video game|🎮|70|game
Sneakers|👟|110|shoes
Concert ticket|🎫|120|concert
Hotel night|🏨|180|hotel
Tent|⛺|200
Round-trip flight|🧳|350|flight,plane ticket
Noise-canceling headphones|🎧|350|headphones
Smartwatch|⌚|400|watch
Snowboard|🏂|450
TV|📺|500|television
Kayak|🛶|500
Bicycle|🚲|600|bike
Drum kit|🥁|700|drums
Camera|📷|800
Smartphone|📱|900|phone,iphone
Mattress|🛏️|1000|bed
Laptop|💻|1200|computer
Couch|🛋️|1500|sofa
Monthly rent (US median)|🏢|1700|rent
Purebred puppy|🐕|2000|puppy,dog
Horse|🐎|4000|pony
Engagement ring|💍|5500|ring
Motorcycle|🏍️|12000|motorbike
Used car|🚙|26000
Wedding (US average)|💒|33000|wedding
Year of private college|🎓|45000|college,tuition
New car|🚗|48000|car
Grand piano|🎹|60000|piano
Average US home|🏠|420000|house,home
Manhattan apartment|🏙️|1100000|apartment,condo
Private jet|🛩️|10000000|jet
Superyacht|🛥️|30000000|yacht
Jet airliner|✈️|100000000|airplane,plane
Record-setting painting|🖼️|450000000|painting,art
Space Shuttle mission|🚀|1500000000|rocket,space shuttle
Pro football team|🏈|6000000000|nfl team,sports team`
};
