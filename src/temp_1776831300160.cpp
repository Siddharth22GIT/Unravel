class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Enter the void...
        vector<int> final;
        for(int i = 0; i<nums.size(); i++){
            for(int j = i+1; j < nums.size(); i++){
                if(nums[i] + nums[j] == target){
                    nums.push_back(i);
                    nums.push_back(j);
                }
            }
        }
        return final;
    }
};