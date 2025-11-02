export const script1 = `
local key                   = KEYS[1]
local max                   = tonumber(ARGV[1])
local refillIntervalSeconds = tonumber(ARGV[2])
local cost                  = tonumber(ARGV[3])
local now                   = tonumber(ARGV[4])

local fields = redis.call("HGETALL", key)
if #fields == 0 then
    redis.call("HSET", key, "count", max - cost, "refilled_at", now)
    return {1}
end
local count = 0
local refilledAt = 0
for i = 1, #fields, 2 do
	if fields[i] == "count" then
        count = tonumber(fields[i+1])
    elseif fields[i] == "refilled_at" then
        refilledAt = tonumber(fields[i+1])
    end
end
local refill = math.floor((now - refilledAt) / refillIntervalSeconds)
count = math.min(count + refill, max)
refilledAt = now
if count < cost then
    return {0}
end
count = count - cost
redis.call("HSET", key, "count", count, "refilled_at", now)
return {1}
`;

export const script2 = `
local key                   = KEYS[1]
local now                   = tonumber(ARGV[1])

local timeoutSeconds = {1, 2, 4, 8, 16, 30, 60, 180, 300}

local fields = redis.call("HGETALL", key)
if #fields == 0 then
    redis.call("HSET", key, "index", 1, "updated_at", now)
    return {1, 0}
end
local index = 0
local updatedAt = 0
for i = 1, #fields, 2 do
	if fields[i] == "index" then
        index = tonumber(fields[i+1])
    elseif fields[i] == "updated_at" then
        updatedAt = tonumber(fields[i+1])
    end
end
local allowed = now - updatedAt >= timeoutSeconds[index]
if not allowed then
    local secondsLeft = timeoutSeconds[index] - (now - updatedAt)
    return {0, secondsLeft}
end
index = math.min(index + 1, #timeoutSeconds)
redis.call("HSET", key, "index", index, "updated_at", now)
return {1, 0}
`;
